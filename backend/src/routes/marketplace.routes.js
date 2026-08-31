// marketplace.routes.js
const express = require('express');
const mpRouter = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { uploadFile } = require('../config/cloudinary');
const { logger } = require('../utils/logger');

const UUID_PATH_SEGMENT =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

const publicMarketplaceReadPatterns = [
  /^\/$/,
  /^\/categories$/,
  /^\/featured-sellers$/,
  new RegExp(`^/sellers/${UUID_PATH_SEGMENT}$`),
  new RegExp(`^/${UUID_PATH_SEGMENT}$`),
];

function isPublicMarketplaceRead(req) {
  return (
    req.method === 'GET' &&
    publicMarketplaceReadPatterns.some(
      (pattern) => pattern.test(req.path)
    )
  );
}

// Marketplace discovery is public, but a valid AgentPro session is used
// when supplied so owner-specific listing behavior remains available.
// Missing credentials are allowed only for the explicitly allowlisted
// read routes above. Invalid/revoked credentials still fail closed.
function marketplaceAccess(req, res, next) {
  if (!isPublicMarketplaceRead(req)) {
    return authenticate(req, res, next);
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  return authenticate(req, res, next);
}

const PUBLIC_AD_FIELDS = [
  'id',
  'category_id',
  'title',
  'description',
  'price',
  'currency',
  'location',
  'image_urls',
  'video_url',
  'published_at',
  'expires_at',
  'views_count',
  'category_name',
  'seller_id',
  'seller_first_name',
  'seller_last_name',
  'seller_profile_image_url',
  'company_name',
  'company_logo_url',
  'seller_verified',
  'is_verified',
  'is_featured',
  'avg_rating',
  'rating_count',
  'seller_average_rating',
  'seller_review_count',
  'is_owner',
];

const PUBLIC_SELLER_FIELDS = [
  'seller_id',
  'first_name',
  'last_name',
  'profile_image_url',
  'company_name',
  'company_logo_url',
  'is_verified',
  'active_ad_count',
  'average_rating',
  'review_count',
];

const PUBLIC_FEATURED_SELLER_FIELDS = [
  'seller_id',
  'first_name',
  'last_name',
  'profile_image_url',
  'company_name',
  'company_logo_url',
  'active_ad_count',
  'average_rating',
  'review_count',
];

function pickPublicFields(value, fields) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  return fields.reduce((safe, field) => {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      safe[field] = value[field];
    }

    return safe;
  }, {});
}

function publicAd(ad) {
  return pickPublicFields(ad, PUBLIC_AD_FIELDS);
}

function publicSeller(seller) {
  return pickPublicFields(seller, PUBLIC_SELLER_FIELDS);
}

function publicFeaturedSeller(seller) {
  return pickPublicFields(seller, PUBLIC_FEATURED_SELLER_FIELDS);
}

mpRouter.use(marketplaceAccess);

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

// List active ads with search, filtering, sorting and pagination.
mpRouter.get('/', async (req, res) => {
  const {
    category_id,
    search,
    location,
    min_price,
    max_price,
    min_rating,
    sort = 'newest',
    page = 1,
    limit = 20,
  } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(
    Math.max(parseInt(limit, 10) || 20, 1),
    100
  );
  const offset = (parsedPage - 1) * parsedLimit;

  try {
    const conditions = [`a.status = 'active'`];
    const params = [];
    let index = 1;

    if (category_id) {
      conditions.push(`a.category_id = $${index++}`);
      params.push(category_id);
    }

    if (search && search.trim()) {
      conditions.push(
        `(a.title ILIKE $${index}
          OR a.description ILIKE $${index}
          OR ac.name ILIKE $${index}
          OR a.location ILIKE $${index})`
      );
      params.push(`%${search.trim()}%`);
      index++;
    }

    if (location && location.trim()) {
      conditions.push(`a.location ILIKE $${index++}`);
      params.push(`%${location.trim()}%`);
    }

    if (min_price !== undefined && min_price !== '') {
      const parsedMinPrice = Number(min_price);

      if (!Number.isFinite(parsedMinPrice) || parsedMinPrice < 0) {
        return res.status(422).json({
          success: false,
          message: 'Minimum price must be a valid non-negative number',
        });
      }

      conditions.push(`a.price >= $${index++}`);
      params.push(parsedMinPrice);
    }

    if (max_price !== undefined && max_price !== '') {
      const parsedMaxPrice = Number(max_price);

      if (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0) {
        return res.status(422).json({
          success: false,
          message: 'Maximum price must be a valid non-negative number',
        });
      }

      conditions.push(`a.price <= $${index++}`);
      params.push(parsedMaxPrice);
    }

    if (
      min_price !== undefined &&
      min_price !== '' &&
      max_price !== undefined &&
      max_price !== '' &&
      Number(min_price) > Number(max_price)
    ) {
      return res.status(422).json({
        success: false,
        message: 'Minimum price cannot exceed maximum price',
      });
    }

    const parsedMinRating =
      min_rating !== undefined && min_rating !== ''
        ? Number(min_rating)
        : null;

    if (
      parsedMinRating !== null &&
      (
        !Number.isFinite(parsedMinRating) ||
        parsedMinRating < 1 ||
        parsedMinRating > 5
      )
    ) {
      return res.status(422).json({
        success: false,
        message: 'Minimum rating must be between 1 and 5',
      });
    }

    const orderBy = {
      newest: 'a.published_at DESC NULLS LAST',
      oldest: 'a.published_at ASC NULLS LAST',
      most_viewed: 'a.views_count DESC, a.published_at DESC NULLS LAST',
      highest_rated:
        'avg_rating DESC NULLS LAST, rating_count DESC, a.published_at DESC NULLS LAST',
      price_low: 'a.price ASC NULLS LAST, a.published_at DESC NULLS LAST',
      price_high: 'a.price DESC NULLS LAST, a.published_at DESC NULLS LAST',
    }[sort];

    if (!orderBy) {
      return res.status(422).json({
        success: false,
        message: 'Invalid marketplace sort option',
      });
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const having =
      parsedMinRating === null
        ? ''
        : `HAVING COALESCE(AVG(ar.rating), 0) >= $${index}`;

    const dataParams = [...params];

    if (parsedMinRating !== null) {
      dataParams.push(parsedMinRating);
      index++;
    }

    const limitParameter = index++;
    const offsetParameter = index++;

    const dataSql = `
      SELECT
        a.*,
        ac.name AS category_name,
        seller.first_name AS seller_first_name,
        seller.last_name AS seller_last_name,
        company.name AS company_name,
        COALESCE(company.marketplace_verified, FALSE) AS seller_verified,
        COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
        COUNT(ar.id)::int AS rating_count
      FROM advertisements a
      LEFT JOIN ad_categories ac
        ON ac.id = a.category_id
      INNER JOIN users seller
        ON seller.id = a.posted_by
      LEFT JOIN companies company
        ON company.id = seller.company_id
      LEFT JOIN ad_ratings ar
        ON ar.advertisement_id = a.id
      ${where}
      GROUP BY
        a.id,
        ac.name,
        seller.id,
        seller.first_name,
        seller.last_name,
        company.id,
        company.name,
        company.marketplace_verified
      ${having}
      ORDER BY ${orderBy}
      LIMIT $${limitParameter}
      OFFSET $${offsetParameter}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT a.id
        FROM advertisements a
        LEFT JOIN ad_categories ac
          ON ac.id = a.category_id
        LEFT JOIN ad_ratings ar
          ON ar.advertisement_id = a.id
        ${where}
        GROUP BY a.id
        ${having}
      ) filtered_ads
    `;

    const [data, count] = await Promise.all([
      query(dataSql, [...dataParams, parsedLimit, offset]),
      query(countSql, dataParams),
    ]);

    res.json({
      success: true,
      data: data.rows.map(publicAd),
      meta: {
        page: parsedPage,
        limit: parsedLimit,
        total: count.rows[0]?.total || 0,
      },
    });
  } catch (e) {
    logger.error('GET /marketplace error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ads',
    });
  }
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
    const sellerId = req.user.id;

    const [
      summaryResult,
      trendResult,
      topAdsResult,
      attentionAdsResult,
      activityResult,
    ] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS total_ads,
           COUNT(*) FILTER (
             WHERE a.status = 'active'
           )::int AS active_ads,
           COUNT(*) FILTER (
             WHERE a.status IN ('pending_review', 'pending_payment')
           )::int AS pending_ads,
           COUNT(*) FILTER (
             WHERE a.status = 'expired'
           )::int AS expired_ads,
           COALESCE(SUM(a.views_count), 0)::int AS total_views,

           (
             SELECT COUNT(*)::int
             FROM advertisement_views av
             INNER JOIN advertisements viewed_ad
               ON viewed_ad.id = av.advertisement_id
             WHERE viewed_ad.posted_by = $1
               AND av.viewed_at >= NOW() - INTERVAL '7 days'
           ) AS views_this_week,

           (
             SELECT COUNT(*)::int
             FROM advertisement_views av
             INNER JOIN advertisements viewed_ad
               ON viewed_ad.id = av.advertisement_id
             WHERE viewed_ad.posted_by = $1
               AND av.viewed_at >= NOW() - INTERVAL '14 days'
               AND av.viewed_at < NOW() - INTERVAL '7 days'
           ) AS views_previous_week,

           (
             SELECT COUNT(*)::int
             FROM marketplace_saved_ads msa
             INNER JOIN advertisements saved_ad
               ON saved_ad.id = msa.ad_id
             WHERE saved_ad.posted_by = $1
           ) AS saved_ads,

           (
             SELECT COUNT(*)::int
             FROM marketplace_conversations mc
             WHERE mc.seller_id = $1
           ) AS enquiries,

           (
             SELECT COUNT(*)::int
             FROM marketplace_messages mm
             INNER JOIN marketplace_conversations mc
               ON mc.id = mm.conversation_id
             WHERE mc.seller_id = $1
               AND mm.sender_id <> $1
               AND mm.read_at IS NULL
           ) AS unread_messages,

           (
             SELECT COALESCE(AVG(ar.rating), 0)::float
             FROM ad_ratings ar
             INNER JOIN advertisements rated_ad
               ON rated_ad.id = ar.advertisement_id
             WHERE rated_ad.posted_by = $1
           ) AS average_rating,

           (
             SELECT COUNT(*)::int
             FROM ad_ratings ar
             INNER JOIN advertisements rated_ad
               ON rated_ad.id = ar.advertisement_id
             WHERE rated_ad.posted_by = $1
           ) AS review_count

         FROM advertisements a
         WHERE a.posted_by = $1`,
        [sellerId]
      ),

      query(
        `WITH days AS (
           SELECT generate_series(
             CURRENT_DATE - INTERVAL '29 days',
             CURRENT_DATE,
             INTERVAL '1 day'
           )::date AS date
         ),
         views AS (
           SELECT
             av.viewed_at::date AS date,
             COUNT(*)::int AS count
           FROM advertisement_views av
           INNER JOIN advertisements a
             ON a.id = av.advertisement_id
           WHERE a.posted_by = $1
             AND av.viewed_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY av.viewed_at::date
         ),
         saves AS (
           SELECT
             msa.created_at::date AS date,
             COUNT(*)::int AS count
           FROM marketplace_saved_ads msa
           INNER JOIN advertisements a
             ON a.id = msa.ad_id
           WHERE a.posted_by = $1
             AND msa.created_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY msa.created_at::date
         ),
         enquiries AS (
           SELECT
             mc.created_at::date AS date,
             COUNT(*)::int AS count
           FROM marketplace_conversations mc
           WHERE mc.seller_id = $1
             AND mc.created_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY mc.created_at::date
         )
         SELECT
           days.date,
           COALESCE(views.count, 0)::int AS views,
           COALESCE(saves.count, 0)::int AS saves,
           COALESCE(enquiries.count, 0)::int AS enquiries
         FROM days
         LEFT JOIN views ON views.date = days.date
         LEFT JOIN saves ON saves.date = days.date
         LEFT JOIN enquiries ON enquiries.date = days.date
         ORDER BY days.date`,
        [sellerId]
      ),

      query(
        `SELECT
           a.id,
           a.title,
           a.image_urls,
           a.status,
           a.views_count::int AS views,
           COUNT(DISTINCT msa.id)::int AS saves,
           COUNT(DISTINCT mc.id)::int AS enquiries,
           COALESCE(AVG(ar.rating), 0)::float AS average_rating
         FROM advertisements a
         LEFT JOIN marketplace_saved_ads msa
           ON msa.ad_id = a.id
         LEFT JOIN marketplace_conversations mc
           ON mc.advertisement_id = a.id
         LEFT JOIN ad_ratings ar
           ON ar.advertisement_id = a.id
         WHERE a.posted_by = $1
         GROUP BY a.id
         ORDER BY
           (
             a.views_count
             + COUNT(DISTINCT msa.id) * 3
             + COUNT(DISTINCT mc.id) * 5
           ) DESC,
           a.created_at DESC
         LIMIT 5`,
        [sellerId]
      ),

      query(
        `SELECT
           a.id,
           a.title,
           a.image_urls,
           a.status,
           a.views_count::int AS views,
           a.expires_at,
           COUNT(DISTINCT msa.id)::int AS saves,
           COUNT(DISTINCT mc.id)::int AS enquiries,
           CASE
             WHEN a.status = 'active'
              AND a.expires_at IS NOT NULL
              AND a.expires_at <= NOW() + INTERVAL '3 days'
               THEN 'Expiring soon'
             WHEN a.status = 'active'
              AND a.views_count = 0
               THEN 'No views yet'
             WHEN a.status = 'active'
              AND COUNT(DISTINCT mc.id) = 0
              AND a.published_at <= NOW() - INTERVAL '7 days'
               THEN 'No enquiries after 7 days'
             ELSE 'Low engagement'
           END AS reason
         FROM advertisements a
         LEFT JOIN marketplace_saved_ads msa
           ON msa.ad_id = a.id
         LEFT JOIN marketplace_conversations mc
           ON mc.advertisement_id = a.id
         WHERE a.posted_by = $1
           AND a.status = 'active'
         GROUP BY a.id
         HAVING
           a.views_count = 0
           OR (
             COUNT(DISTINCT mc.id) = 0
             AND a.published_at <= NOW() - INTERVAL '7 days'
           )
           OR (
             a.expires_at IS NOT NULL
             AND a.expires_at <= NOW() + INTERVAL '3 days'
           )
         ORDER BY
           a.views_count ASC,
           a.expires_at ASC NULLS LAST
         LIMIT 5`,
        [sellerId]
      ),

      query(
        `SELECT *
         FROM (
           SELECT
             'view' AS activity_type,
             a.id AS advertisement_id,
             a.title AS advertisement_title,
             NULL::text AS customer_name,
             av.viewed_at AS occurred_at
           FROM advertisement_views av
           INNER JOIN advertisements a
             ON a.id = av.advertisement_id
           WHERE a.posted_by = $1

           UNION ALL

           SELECT
             'save' AS activity_type,
             a.id AS advertisement_id,
             a.title AS advertisement_title,
             CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
             msa.created_at AS occurred_at
           FROM marketplace_saved_ads msa
           INNER JOIN advertisements a
             ON a.id = msa.ad_id
           LEFT JOIN users u
             ON u.id = msa.user_id
           WHERE a.posted_by = $1

           UNION ALL

           SELECT
             'enquiry' AS activity_type,
             a.id AS advertisement_id,
             a.title AS advertisement_title,
             CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
             mc.created_at AS occurred_at
           FROM marketplace_conversations mc
           INNER JOIN advertisements a
             ON a.id = mc.advertisement_id
           LEFT JOIN users u
             ON u.id = mc.customer_id
           WHERE mc.seller_id = $1

           UNION ALL

           SELECT
             'review' AS activity_type,
             a.id AS advertisement_id,
             a.title AS advertisement_title,
             CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
             ar.created_at AS occurred_at
           FROM ad_ratings ar
           INNER JOIN advertisements a
             ON a.id = ar.advertisement_id
           LEFT JOIN users u
             ON u.id = ar.rated_by
           WHERE a.posted_by = $1
         ) activity
         ORDER BY occurred_at DESC
         LIMIT 12`,
        [sellerId]
      ),
    ]);

    const summary = summaryResult.rows[0] || {};

    const currentWeek = Number(summary.views_this_week || 0);
    const previousWeek = Number(summary.views_previous_week || 0);

    let viewGrowthPercent = 0;

    if (previousWeek > 0) {
      viewGrowthPercent =
        ((currentWeek - previousWeek) / previousWeek) * 100;
    } else if (currentWeek > 0) {
      viewGrowthPercent = 100;
    }

    res.json({
      success: true,
      data: {
        ...summary,
        view_growth_percent:
          Math.round(viewGrowthPercent * 10) / 10,
        view_trend: trendResult.rows,
        top_ads: topAdsResult.rows,
        attention_ads: attentionAdsResult.rows,
        recent_activity: activityResult.rows,
      },
    });
  } catch (e) {
    logger.error('GET /marketplace/dashboard error:', e);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace dashboard',
    });
  }
});

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
    logger.error('GET /marketplace/reviews/received error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer reviews',
    });
  }
});

// Start or continue a private customer enquiry about an active ad.
mpRouter.post('/:ad_id/enquiries', async (req, res) => {
  const body = req.body.message?.trim();

  if (!body || body.length > 2000) {
    return res.status(422).json({
      success: false,
      message: 'Message is required and must not exceed 2000 characters',
    });
  }

  try {
    const adResult = await query(
      `SELECT id, posted_by, title, status
       FROM advertisements
       WHERE id = $1`,
      [req.params.ad_id]
    );

    if (!adResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Advertisement not found',
      });
    }

    const ad = adResult.rows[0];

    if (ad.status !== 'active') {
      return res.status(422).json({
        success: false,
        message: 'Enquiries can only be sent for active advertisements',
      });
    }

    if (ad.posted_by === req.user.id) {
      return res.status(422).json({
        success: false,
        message: 'You cannot send an enquiry about your own advertisement',
      });
    }

    const conversationResult = await query(
      `INSERT INTO marketplace_conversations
         (advertisement_id, customer_id, seller_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (advertisement_id, customer_id)
       DO UPDATE SET
         status = 'open',
         updated_at = NOW()
       RETURNING *`,
      [ad.id, req.user.id, ad.posted_by]
    );

    const conversation = conversationResult.rows[0];

    const messageResult = await query(
      `INSERT INTO marketplace_messages
         (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversation.id, req.user.id, body]
    );

    res.status(201).json({
      success: true,
      data: {
        conversation,
        message: messageResult.rows[0],
      },
    });
  } catch (e) {
    logger.error('POST /marketplace/:ad_id/enquiries error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to send enquiry',
    });
  }
});

// List marketplace conversations for the current user.
mpRouter.get('/enquiries', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         c.id,
         c.advertisement_id,
         c.customer_id,
         c.seller_id,
         c.status,
         c.created_at,
         c.updated_at,
         a.title AS ad_title,
         a.image_urls,
         customer.first_name AS customer_first_name,
         customer.last_name AS customer_last_name,
         customer.profile_image_url AS customer_profile_image_url,
         seller.first_name AS seller_first_name,
         seller.last_name AS seller_last_name,
         seller.profile_image_url AS seller_profile_image_url,
         (
           SELECT mm.body
           FROM marketplace_messages mm
           WHERE mm.conversation_id = c.id
           ORDER BY mm.created_at DESC
           LIMIT 1
         ) AS last_message,
         (
           SELECT mm.created_at
           FROM marketplace_messages mm
           WHERE mm.conversation_id = c.id
           ORDER BY mm.created_at DESC
           LIMIT 1
         ) AS last_message_at,
         (
           SELECT COUNT(*)::int
           FROM marketplace_messages mm
           WHERE mm.conversation_id = c.id
             AND mm.sender_id <> $1
             AND mm.read_at IS NULL
         ) AS unread_count
       FROM marketplace_conversations c
       INNER JOIN advertisements a
         ON a.id = c.advertisement_id
       INNER JOIN users customer
         ON customer.id = c.customer_id
       INNER JOIN users seller
         ON seller.id = c.seller_id
       WHERE c.customer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(
         (
           SELECT MAX(mm.created_at)
           FROM marketplace_messages mm
           WHERE mm.conversation_id = c.id
         ),
         c.updated_at
       ) DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (e) {
    logger.error('GET /marketplace/enquiries error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiries',
    });
  }
});

// Fetch one conversation and its messages.
mpRouter.get('/enquiries/:conversation_id', async (req, res) => {
  try {
    const conversationResult = await query(
      `SELECT
         c.*,
         a.title AS ad_title,
         a.status AS ad_status,
         customer.first_name AS customer_first_name,
         customer.last_name AS customer_last_name,
         customer.profile_image_url AS customer_profile_image_url,
         seller.first_name AS seller_first_name,
         seller.last_name AS seller_last_name,
         seller.profile_image_url AS seller_profile_image_url
       FROM marketplace_conversations c
       INNER JOIN advertisements a
         ON a.id = c.advertisement_id
       INNER JOIN users customer
         ON customer.id = c.customer_id
       INNER JOIN users seller
         ON seller.id = c.seller_id
       WHERE c.id = $1
         AND (c.customer_id = $2 OR c.seller_id = $2)`,
      [req.params.conversation_id, req.user.id]
    );

    if (!conversationResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    const messagesResult = await query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         m.body,
         m.read_at,
         m.created_at,
         u.first_name AS sender_first_name,
         u.last_name AS sender_last_name
       FROM marketplace_messages m
       INNER JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.conversation_id]
    );

    await query(
      `UPDATE marketplace_messages
       SET read_at = NOW()
       WHERE conversation_id = $1
         AND sender_id <> $2
         AND read_at IS NULL`,
      [req.params.conversation_id, req.user.id]
    );

    res.json({
      success: true,
      data: {
        conversation: conversationResult.rows[0],
        messages: messagesResult.rows,
      },
    });
  } catch (e) {
    logger.error('GET /marketplace/enquiries/:conversation_id error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation',
    });
  }
});

// Send a message in an existing marketplace conversation.
mpRouter.post('/enquiries/:conversation_id/messages', async (req, res) => {
  const body = req.body.message?.trim();

  if (!body || body.length > 2000) {
    return res.status(422).json({
      success: false,
      message: 'Message is required and must not exceed 2000 characters',
    });
  }

  try {
    const conversationResult = await query(
      `SELECT id, customer_id, seller_id, status
       FROM marketplace_conversations
       WHERE id = $1
         AND (customer_id = $2 OR seller_id = $2)`,
      [req.params.conversation_id, req.user.id]
    );

    if (!conversationResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    if (conversationResult.rows[0].status === 'closed') {
      return res.status(422).json({
        success: false,
        message: 'This conversation is closed',
      });
    }

    const result = await query(
      `INSERT INTO marketplace_messages
         (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.conversation_id, req.user.id, body]
    );

    await query(
      `UPDATE marketplace_conversations
       SET updated_at = NOW()
       WHERE id = $1`,
      [req.params.conversation_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (e) {
    logger.error(
      'POST /marketplace/enquiries/:conversation_id/messages error:',
      e
    );
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
    });
  }
});


// List advertisements saved by the current user.
mpRouter.get('/saved', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         a.*,
         ac.name AS category_name,
         COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
         COUNT(ar.id)::int AS rating_count,
         TRUE AS is_saved
       FROM marketplace_saved_ads msa
       INNER JOIN advertisements a
         ON a.id = msa.ad_id
       LEFT JOIN ad_categories ac
         ON ac.id = a.category_id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       WHERE msa.user_id = $1
         AND a.status = 'active'
       GROUP BY a.id, ac.name, msa.created_at
       ORDER BY msa.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (e) {
    logger.error('GET /marketplace/saved error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved advertisements',
    });
  }
});

// Return only saved advertisement IDs for lightweight list hydration.
mpRouter.get('/saved/ids', async (req, res) => {
  try {
    const result = await query(
      `SELECT ad_id
       FROM marketplace_saved_ads
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows.map((row) => row.ad_id),
    });
  } catch (e) {
    logger.error('GET /marketplace/saved/ids error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved advertisement IDs',
    });
  }
});

// Check whether one advertisement is saved by the current user.
mpRouter.get('/:ad_id/saved-status', async (req, res) => {
  try {
    const result = await query(
      `SELECT EXISTS (
         SELECT 1
         FROM marketplace_saved_ads
         WHERE user_id = $1
           AND ad_id = $2
       ) AS is_saved`,
      [req.user.id, req.params.ad_id]
    );

    res.json({
      success: true,
      data: {
        is_saved: result.rows[0]?.is_saved === true,
      },
    });
  } catch (e) {
    logger.error('GET /marketplace/:ad_id/saved-status error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to check saved status',
    });
  }
});

// Save an active advertisement.
mpRouter.post('/:ad_id/save', async (req, res) => {
  try {
    const adResult = await query(
      `SELECT id, status
       FROM advertisements
       WHERE id = $1`,
      [req.params.ad_id]
    );

    if (!adResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Advertisement not found',
      });
    }

    if (adResult.rows[0].status !== 'active') {
      return res.status(422).json({
        success: false,
        message: 'Only active advertisements can be saved',
      });
    }

    await query(
      `INSERT INTO marketplace_saved_ads (user_id, ad_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, ad_id) DO NOTHING`,
      [req.user.id, req.params.ad_id]
    );

    res.json({
      success: true,
      data: { is_saved: true },
      message: 'Advertisement saved',
    });
  } catch (e) {
    logger.error('POST /marketplace/:ad_id/save error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to save advertisement',
    });
  }
});

// Remove an advertisement from saved items.
mpRouter.delete('/:ad_id/save', async (req, res) => {
  try {
    await query(
      `DELETE FROM marketplace_saved_ads
       WHERE user_id = $1
         AND ad_id = $2`,
      [req.user.id, req.params.ad_id]
    );

    res.json({
      success: true,
      data: { is_saved: false },
      message: 'Advertisement removed from saved items',
    });
  } catch (e) {
    logger.error('DELETE /marketplace/:ad_id/save error:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to remove saved advertisement',
    });
  }
});

// Recently viewed active advertisements for the current user.
mpRouter.get('/recently-viewed', async (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10) || 10;
  const limit = Math.min(Math.max(requestedLimit, 1), 30);

  try {
    const result = await query(
      `SELECT
         a.*,
         ac.name AS category_name,
         seller.first_name AS seller_first_name,
         seller.last_name AS seller_last_name,
         company.name AS company_name,
         COALESCE(company.marketplace_verified, FALSE) AS seller_verified,
         recent.last_viewed_at,
         COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
         COUNT(ar.id)::int AS rating_count
       FROM (
         SELECT
           advertisement_id,
           MAX(viewed_at) AS last_viewed_at
         FROM advertisement_views
         WHERE viewed_by = $1
         GROUP BY advertisement_id
       ) recent
       INNER JOIN advertisements a
         ON a.id = recent.advertisement_id
        AND a.status = 'active'
       LEFT JOIN ad_categories ac
         ON ac.id = a.category_id
       INNER JOIN users seller
         ON seller.id = a.posted_by
       LEFT JOIN companies company
         ON company.id = seller.company_id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       GROUP BY
         a.id,
         ac.name,
         seller.id,
         seller.first_name,
         seller.last_name,
         company.id,
         company.name,
         company.marketplace_verified,
         recent.last_viewed_at
       ORDER BY recent.last_viewed_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (e) {
    logger.error('GET /marketplace/recently-viewed error:', e);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch recently viewed advertisements',
    });
  }
});

// Recommendations based on categories the user has viewed recently.
// Falls back to popular active ads when there is not enough history.
mpRouter.get('/recommendations', async (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10) || 10;
  const limit = Math.min(Math.max(requestedLimit, 1), 30);

  try {
    const result = await query(
      `WITH viewed_categories AS (
         SELECT
           a.category_id,
           COUNT(*)::int AS interest_score,
           MAX(av.viewed_at) AS last_interest_at
         FROM advertisement_views av
         INNER JOIN advertisements a
           ON a.id = av.advertisement_id
         WHERE av.viewed_by = $1
           AND a.category_id IS NOT NULL
         GROUP BY a.category_id
       ),
       viewed_ads AS (
         SELECT DISTINCT advertisement_id
         FROM advertisement_views
         WHERE viewed_by = $1
       )
       SELECT
         a.*,
         ac.name AS category_name,
         seller.first_name AS seller_first_name,
         seller.last_name AS seller_last_name,
         company.name AS company_name,
         COALESCE(company.marketplace_verified, FALSE) AS seller_verified,
         COALESCE(vc.interest_score, 0)::int AS recommendation_score,
         COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
         COUNT(ar.id)::int AS rating_count
       FROM advertisements a
       LEFT JOIN ad_categories ac
         ON ac.id = a.category_id
       INNER JOIN users seller
         ON seller.id = a.posted_by
       LEFT JOIN companies company
         ON company.id = seller.company_id
       LEFT JOIN viewed_categories vc
         ON vc.category_id = a.category_id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       LEFT JOIN viewed_ads va
         ON va.advertisement_id = a.id
       WHERE a.status = 'active'
         AND a.posted_by <> $1
         AND va.advertisement_id IS NULL
       GROUP BY
         a.id,
         ac.name,
         seller.id,
         seller.first_name,
         seller.last_name,
         company.id,
         company.name,
         company.marketplace_verified,
         vc.interest_score,
         vc.last_interest_at
       ORDER BY
         CASE WHEN vc.interest_score IS NULL THEN 1 ELSE 0 END,
         vc.interest_score DESC NULLS LAST,
         vc.last_interest_at DESC NULLS LAST,
         a.views_count DESC,
         avg_rating DESC,
         a.published_at DESC NULLS LAST
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (e) {
    logger.error('GET /marketplace/recommendations error:', e);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace recommendations',
    });
  }
});

// Featured verified businesses for the Business Hub home.
mpRouter.get('/featured-sellers', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         c.id AS company_id,
         c.name AS company_name,
         c.logo_url AS company_logo_url,
         c.address AS company_address,
         c.marketplace_featured_priority,
         owner.id AS seller_id,
         owner.first_name,
         owner.last_name,
         owner.profile_image_url,
         COUNT(DISTINCT CASE
           WHEN a.status = 'active' THEN a.id
         END)::int AS active_ad_count,
         COALESCE(AVG(ar.rating), 0)::float AS average_rating,
         COUNT(ar.id)::int AS review_count
       FROM companies c
       INNER JOIN users owner
         ON owner.company_id = c.id
        AND owner.role = 'business_owner'
        AND owner.status = 'active'
       LEFT JOIN advertisements a
         ON a.posted_by = owner.id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       WHERE c.status = 'active'
         AND c.marketplace_verified = TRUE
         AND c.marketplace_featured = TRUE
       GROUP BY
         c.id,
         owner.id,
         owner.first_name,
         owner.last_name,
         owner.profile_image_url
       HAVING COUNT(DISTINCT CASE
         WHEN a.status = 'active' THEN a.id
       END) > 0
       ORDER BY
         c.marketplace_featured_priority DESC,
         c.marketplace_featured_at DESC NULLS LAST,
         c.name ASC
       LIMIT 20`
    );

    res.json({
      success: true,
      data: result.rows.map(publicFeaturedSeller),
    });
  } catch (e) {
    logger.error('GET /marketplace/featured-sellers error:', e);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured businesses',
    });
  }
});

// Get a public seller storefront and all active advertisements.
mpRouter.get('/sellers/:seller_id', async (req, res) => {
  try {
    const sellerResult = await query(
      `SELECT
         u.id AS seller_id,
         u.first_name,
         u.last_name,
         u.phone AS seller_phone,
         u.email AS seller_email,
         u.profile_image_url,
         u.company_id,
         c.name AS company_name,
         c.phone AS company_phone,
         c.email AS company_email,
         c.address AS company_address,
         c.logo_url AS company_logo_url,
         c.status AS company_status,
         c.approved_at,
         COALESCE(c.marketplace_verified, FALSE) AS is_verified,
         COUNT(DISTINCT CASE
           WHEN a.status = 'active' THEN a.id
         END)::int AS active_ad_count,
         COALESCE(AVG(ar.rating), 0)::float AS average_rating,
         COUNT(ar.id)::int AS review_count
       FROM users u
       LEFT JOIN companies c
         ON c.id = u.company_id
       LEFT JOIN advertisements a
         ON a.posted_by = u.id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       WHERE u.id = $1
       GROUP BY
         u.id,
         u.first_name,
         u.last_name,
         u.phone,
         u.email,
         u.profile_image_url,
         u.company_id,
         c.id,
         c.name,
         c.phone,
         c.email,
         c.address,
         c.logo_url,
         c.status,
         c.approved_at`,
      [req.params.seller_id]
    );

    if (!sellerResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found',
      });
    }

    const adsResult = await query(
      `SELECT
         a.*,
         ac.name AS category_name,
         COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
         COUNT(ar.id)::int AS rating_count
       FROM advertisements a
       LEFT JOIN ad_categories ac
         ON ac.id = a.category_id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       WHERE a.posted_by = $1
         AND a.status = 'active'
       GROUP BY a.id, ac.name
       ORDER BY a.published_at DESC NULLS LAST`,
      [req.params.seller_id]
    );

    res.json({
      success: true,
      data: {
        seller: publicSeller(sellerResult.rows[0]),
        advertisements: adsResult.rows.map(publicAd),
      },
    });
  } catch (e) {
    logger.error('GET /marketplace/sellers/:seller_id error:', e);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller storefront',
    });
  }
});

// Get a single ad by ID — scoped to the owner, since this is used to show
// payment instructions and status for an ad that may not yet be public
// (i.e. not necessarily 'active', so it can't go through the public list).
mpRouter.get('/:ad_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         a.*,
         ac.name AS category_name,
         u.id AS seller_id,
         u.first_name AS seller_first_name,
         u.last_name AS seller_last_name,
         u.profile_image_url AS seller_profile_image_url,
         u.phone AS seller_phone,
         c.name AS company_name,
         c.logo_url AS company_logo_url,
         c.phone AS company_phone,
         c.email AS company_email,
         c.address AS company_address,
         COALESCE(c.marketplace_verified, FALSE) AS is_verified,
         COALESCE(c.marketplace_featured, FALSE) AS is_featured,
         COALESCE(AVG(ar.rating), 0)::float AS avg_rating,
         COUNT(ar.id)::int AS rating_count,
         (
           SELECT COALESCE(AVG(seller_rating.rating), 0)::float
           FROM ad_ratings seller_rating
           INNER JOIN advertisements seller_ad
             ON seller_ad.id = seller_rating.advertisement_id
           WHERE seller_ad.posted_by = u.id
         ) AS seller_average_rating,
         (
           SELECT COUNT(*)::int
           FROM ad_ratings seller_rating_count
           INNER JOIN advertisements seller_ad_count
             ON seller_ad_count.id = seller_rating_count.advertisement_id
           WHERE seller_ad_count.posted_by = u.id
         ) AS seller_review_count
       FROM advertisements a
       LEFT JOIN ad_categories ac
         ON ac.id = a.category_id
       INNER JOIN users u
         ON u.id = a.posted_by
       LEFT JOIN companies c
         ON c.id = u.company_id
       LEFT JOIN ad_ratings ar
         ON ar.advertisement_id = a.id
       WHERE a.id = $1
       GROUP BY
         a.id,
         ac.name,
         u.id,
         u.first_name,
         u.last_name,
         u.profile_image_url,
         u.phone,
         c.id,
         c.name,
         c.logo_url,
         c.phone,
         c.email,
         c.address,
         c.status,
         c.approved_at`,
      [req.params.ad_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }
    const ad = result.rows[0];
    const viewerId = req.user?.id || null;
    const isOwner = viewerId !== null && ad.posted_by === viewerId;

    ad.is_owner = isOwner;

    // Owners can always view their own ad regardless of status.
    // Anonymous and other authenticated viewers can only see active ads.
    if (!isOwner && ad.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Ad not found',
      });
    }

    // Keep authenticated third-party view deduplication exactly as before.
    // Anonymous browsing does not manufacture a user identity or persist
    // IP/device information merely for view analytics.
    if (viewerId !== null && !isOwner) {
      Promise.all([
        query(
          'UPDATE advertisements SET views_count = views_count + 1 WHERE id = $1',
          [req.params.ad_id]
        ),
        query(
          `INSERT INTO advertisement_views
             (advertisement_id, viewed_by)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1
             FROM advertisement_views
             WHERE advertisement_id = $1
               AND viewed_by = $2
               AND viewed_at >= NOW() - INTERVAL '30 minutes'
           )`,
          [req.params.ad_id, viewerId]
        ),
      ]).catch(() => {});
      // View analytics are non-blocking and must not prevent the ad from loading.
    }

    res.json({
      success: true,
      data: isOwner ? ad : publicAd(ad),
    });
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
    logger.error('POST /marketplace error:', e);
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
