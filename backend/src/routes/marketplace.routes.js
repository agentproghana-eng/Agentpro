// marketplace.routes.js
const express = require('express');
const mpRouter = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { uploadFile } = require('../config/cloudinary');

mpRouter.use(authenticate);

// Ad photos: memoryStorage (buffer piped straight to Cloudinary, no
// local disk writes), image MIME types only, capped at 5MB each and
// 3 images max per ad - matches the "1–3 photos" design confirmed
// earlier for this feature.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// List active ads (free tier can browse)
mpRouter.get('/', async (req, res) => {
  const { category_id, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const conditions = [`a.status = 'active'`];
    const params = [];
    let idx = 1;
    if (category_id) { conditions.push(`a.category_id = $${idx++}`); params.push(category_id); }
    if (search) { conditions.push(`(a.title ILIKE $${idx} OR a.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [data, count] = await Promise.all([
      query(`SELECT a.*, ac.name as category_name, AVG(ar.rating) as avg_rating, COUNT(ar.id) as rating_count
             FROM advertisements a LEFT JOIN ad_categories ac ON a.category_id = ac.id
             LEFT JOIN ad_ratings ar ON ar.advertisement_id = a.id
             ${where} GROUP BY a.id, ac.name ORDER BY a.published_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]),
      query(`SELECT COUNT(*) FROM advertisements a ${where}`, params),
    ]);
    res.json({ success: true, data: data.rows, meta: { total: parseInt(count.rows[0].count) } });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch ads' }); }
});

// Get categories
mpRouter.get('/categories', async (req, res) => {
  try {
    const result = await query('SELECT * FROM ad_categories WHERE is_active = TRUE ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch categories' }); }
});

// List the current user's own ads, regardless of status (pending_review,
// pending_payment, active, rejected, expired). The public list endpoint
// above only ever returns 'active' ads, so a user has no other way to
// see or act on an ad they just submitted.
mpRouter.get('/mine', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, ac.name as category_name
       FROM advertisements a LEFT JOIN ad_categories ac ON a.category_id = ac.id
       WHERE a.posted_by = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch your ads' }); }
});

// Business Hub performance summary for the current user.
mpRouter.get('/dashboard', async (req, res) => {
  try {
    const result = await query(
      `WITH ad_summary AS (
         SELECT
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_ads,
           COUNT(*) FILTER (
             WHERE status IN ('pending_review', 'pending_payment')
           )::int AS pending_ads,
           COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_ads,
           COALESCE(SUM(views_count), 0)::int AS total_views
         FROM advertisements
         WHERE posted_by = $1
       ),
       rating_summary AS (
         SELECT
           COALESCE(AVG(ar.rating), 0)::float AS average_rating,
           COUNT(ar.id)::int AS review_count
         FROM ad_ratings ar
         INNER JOIN advertisements a
           ON a.id = ar.advertisement_id
         WHERE a.posted_by = $1
       )
       SELECT *
       FROM ad_summary
       CROSS JOIN rating_summary`,
      [req.user.id]
    );

    const trends = await query(
      `WITH days AS (
         SELECT generate_series(
           CURRENT_DATE - INTERVAL '29 days',
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS day
       ),
       daily_views AS (
         SELECT
           av.viewed_at::date AS day,
           COUNT(*)::int AS views
         FROM advertisement_views av
         INNER JOIN advertisements a
           ON a.id = av.advertisement_id
         WHERE a.posted_by = $1
           AND av.viewed_at >= CURRENT_DATE - INTERVAL '29 days'
         GROUP BY av.viewed_at::date
       )
       SELECT
         TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
         COALESCE(daily_views.views, 0)::int AS views
       FROM days
       LEFT JOIN daily_views ON daily_views.day = days.day
       ORDER BY days.day`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        view_trend: trends.rows,
      },
    });
  } catch (e) {
    console.error('GET /marketplace/dashboard error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Business Hub performance',
    });
  }
});

// Reviews received by the current user's advertisements.
mpRouter.get('/reviews/received', async (req, res) => {
  const {
    ad_id,
    rating,
    page = 1,
    limit = 20,
  } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (parsedPage - 1) * parsedLimit;

  try {
    const conditions = ['a.posted_by = $1'];
    const params = [req.user.id];
    let index = 2;

    if (ad_id) {
      conditions.push(`a.id = $${index++}`);
      params.push(ad_id);
    }

    if (rating) {
      const parsedRating = parseInt(rating, 10);
      if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(422).json({
          success: false,
          message: 'Rating must be between 1 and 5',
        });
      }

      conditions.push(`ar.rating = $${index++}`);
      params.push(parsedRating);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [reviews, count, ads] = await Promise.all([
      query(
        `SELECT
           ar.id,
           ar.advertisement_id,
           ar.rating,
           ar.review,
           ar.created_at,
           a.title AS ad_title,
           u.first_name AS reviewer_first_name,
           u.last_name AS reviewer_last_name,
           u.profile_image_url AS reviewer_profile_image_url
         FROM ad_ratings ar
         INNER JOIN advertisements a
           ON a.id = ar.advertisement_id
         INNER JOIN users u
           ON u.id = ar.rated_by
         ${where}
         ORDER BY ar.created_at DESC
         LIMIT $${index++}
         OFFSET $${index++}`,
        [...params, parsedLimit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM ad_ratings ar
         INNER JOIN advertisements a
           ON a.id = ar.advertisement_id
         ${where}`,
        params
      ),
      query(
        `SELECT
           a.id,
           a.title,
           COUNT(ar.id)::int AS review_count
         FROM advertisements a
         LEFT JOIN ad_ratings ar
           ON ar.advertisement_id = a.id
         WHERE a.posted_by = $1
         GROUP BY a.id, a.title
         HAVING COUNT(ar.id) > 0
         ORDER BY a.title`,
        [req.user.id]
      ),
    ]);

    const total = count.rows[0]?.total ?? 0;

    res.json({
      success: true,
      data: reviews.rows,
      filters: {
        ads: ads.rows,
      },
      meta: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        total_pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (e) {
    console.error('GET /marketplace/reviews/received error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer reviews',
    });
  }
});

// Get a single ad by ID — scoped to the owner, since this is used to show
// payment instructions and status for an ad that may not yet be public
// (i.e. not necessarily 'active', so it can't go through the public list).
mpRouter.get('/:ad_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, ac.name as category_name
       FROM advertisements a LEFT JOIN ad_categories ac ON a.category_id = ac.id
       WHERE a.id = $1`,
      [req.params.ad_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }
    const ad = result.rows[0];
    // Owners can always view their own ad regardless of status.
    // Anyone else can only view it once it's actually published.
    if (ad.posted_by !== req.user.id && ad.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    // Only count third-party views, not the owner checking their own
    // listing - otherwise a seller refreshing their own ad would
    // inflate the number they're using to judge its performance.
    if (ad.posted_by !== req.user.id) {
      Promise.all([
        query(
          'UPDATE advertisements SET views_count = views_count + 1 WHERE id = $1',
          [req.params.ad_id]
        ),
        query(
          `INSERT INTO advertisement_views
             (advertisement_id, viewed_by)
           VALUES ($1, $2)`,
          [req.params.ad_id, req.user.id]
        ),
      ]).catch(() => {});
      // View analytics are non-blocking and must not prevent the ad from loading.
    }
    res.json({ success: true, data: ad });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch ad' }); }
});

// Submit an ad. Photos are optional (upload.array tolerates zero
// files fine) but capped at 3 - anything beyond that is silently
// ignored by multer's array limit rather than erroring, which is the
// right behavior here (better to accept the first 3 than reject the
// whole submission over an agent picking a 4th photo).
mpRouter.post('/', upload.array('images', 3), async (req, res) => {
  const { title, description, price, category_id, location, contact_phone } = req.body;
  try {
    const feeConfig = await query("SELECT value FROM system_config WHERE key = 'ad_fee_percent'");
    const feePercent = parseFloat(feeConfig.rows[0]?.value || 0.01);
    const publishingFee = price ? Math.round(parseFloat(price) * feePercent * 100) / 100 : 0;

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = await Promise.all(
        req.files.map(file =>
          uploadFile(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
            folder: 'ads',
            resource_type: 'image',
          })
        )
      );
    }

    const result = await query(
      `INSERT INTO advertisements (posted_by, company_id, category_id, title, description, price, location, contact_phone, publishing_fee, fee_percent, status, image_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_review', $11) RETURNING *`,
      [req.user.id, req.user.company_id || null, category_id, title, description, price, location, contact_phone, publishingFee, feePercent, imageUrls]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Ad submitted for review.' });
  } catch (e) {
    console.error('POST /marketplace error:', e);
    res.status(500).json({ success: false, message: 'Failed to submit ad' });
  }
});

// Submit payment for an ad
mpRouter.post('/:ad_id/payment', async (req, res) => {
  const { momo_reference, payment_phone } = req.body;
  try {
    const ad = await query('SELECT * FROM advertisements WHERE id = $1 AND posted_by = $2', [req.params.ad_id, req.user.id]);
    if (!ad.rows.length) return res.status(404).json({ success: false, message: 'Ad not found' });
    const result = await query(
      `INSERT INTO ad_payments (advertisement_id, posted_by, amount, momo_reference, payment_phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.ad_id, req.user.id, ad.rows[0].publishing_fee, momo_reference, payment_phone]
    );
    await query("UPDATE advertisements SET status = 'pending_payment' WHERE id = $1", [req.params.ad_id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to submit payment' }); }
});

module.exports = mpRouter;
