const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { withTransaction } = require('../config/database');
const { sendWelcomeEmail } = require('../services/emailService');
const { sendRegistrationApprovedSMS, sendAdPaymentConfirmedSMS } = require('../services/smsService');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');

router.use(authenticate, authorize('superuser'));

// ── Platform Overview ─────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const [companies, users, transactions, subscriptions, pendingAds] = await Promise.all([
      query('SELECT COUNT(*) as total, COUNT(CASE WHEN status = $1 THEN 1 END) as active FROM companies', ['active']),
      query('SELECT COUNT(*) as total FROM users WHERE role != $1', ['superuser']),
      query(`SELECT COUNT(*) as today FROM transactions WHERE created_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*) as active FROM subscriptions WHERE status = 'active'`),
      query(`SELECT COUNT(*) as count FROM advertisements WHERE status IN ('pending_review', 'pending_payment')`),
    ]);
    res.json({
      success: true, data: {
        companies: companies.rows[0],
        users: users.rows[0],
        transactions_today: transactions.rows[0].today,
        active_subscriptions: subscriptions.rows[0].active,
        pending_ads: pendingAds.rows[0].count,
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch overview' }); }
});

// ── Pending Registrations ─────────────────────────────────────
router.get('/pending-registrations', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.phone, u.ghana_card_number
       FROM companies c INNER JOIN users u ON u.company_id = c.id AND u.role = 'business_owner'
       WHERE c.status = 'pending' ORDER BY c.created_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch registrations' }); }
});

// ── Approve Registration (starts 30-day free trial) ────────────
router.patch("/pending-registrations/:company_id/approve", async (req, res) => {
  const { company_id } = req.params;

  try {
    const result = await withTransaction(async (client) => {
      const companyCheck = await client.query(
        "SELECT id, name, status FROM companies WHERE id = $1",
        [company_id]
      );
      if (companyCheck.rows.length === 0) {
        throw { statusCode: 404, message: "Company not found" };
      }
      if (companyCheck.rows[0].status !== "pending") {
        throw { statusCode: 400, message: `Company is already ${companyCheck.rows[0].status}, not pending` };
      }

      await client.query(
        `UPDATE companies SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [company_id]
      );

      const ownerResult = await client.query(
        `UPDATE users SET status = 'active', updated_at = NOW()
         WHERE company_id = $1 AND role = 'business_owner'
         RETURNING id, email, phone, first_name, last_name`,
        [company_id]
      );
      if (ownerResult.rows.length === 0) {
        throw { statusCode: 404, message: "No business owner found for this company" };
      }
      const owner = ownerResult.rows[0];

      await client.query(
        `UPDATE subscriptions SET status = 'active', started_at = NOW(), expires_at = NOW() + INTERVAL '30 days', updated_at = NOW() WHERE company_id = $1 AND plan = 'free'`,
        [company_id]
      );

      return { company: companyCheck.rows[0], owner };
    });

    try {
      await sendWelcomeEmail(result.owner.email, result.owner.first_name, result.company.name);
    } catch (emailErr) {
      logger.error("Failed to send approval welcome email:", emailErr);
    }

    if (result.owner.phone) {
      try {
        await sendRegistrationApprovedSMS(result.owner.phone, result.owner.first_name, result.company.name);
      } catch (smsErr) {
        logger.error("Failed to send approval SMS:", smsErr);
      }
    }

    await auditLog({
      userId: req.user.id,
      companyId: company_id,
      action: "REGISTRATION_APPROVED",
      entityType: "company",
      entityId: company_id,
      newValues: { status: "active", trial_days: 30 },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: `${result.company.name} approved. 30-day free trial started for ${result.owner.email}.`,
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ success: false, message: e.message });
    }
    logger.error("Approve registration error:", e);
    res.status(500).json({ success: false, message: "Failed to approve registration" });
  }
});

// ── System Config ─────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_config ORDER BY key');
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch config' }); }
});

router.patch('/config/:key', async (req, res) => {
  const { value } = req.body;
  try {
    const result = await query(
      'UPDATE system_config SET value = $1, updated_at = NOW(), updated_by = $2 WHERE key = $3 RETURNING *',
      [value, req.user.id, req.params.key]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Config key not found' });
    await auditLog({ userId: req.user.id, action: 'CONFIG_UPDATED', newValues: { key: req.params.key, value }, ipAddress: req.ip });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to update config' }); }
});

// ── USSD Templates ────────────────────────────────────────────
router.get('/ussd-templates', async (req, res) => {
  try {
    const result = await query('SELECT * FROM ussd_templates ORDER BY provider, transaction_type');
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch templates' }); }
});

router.patch('/ussd-templates/:id', async (req, res) => {
  const {
    ussd_string_pattern, placeholder_fields, pin_prompt_strings,
    success_strings, failure_strings, timeout_seconds, retry_count, is_active
  } = req.body;

  // Server-side safety net — mirrors the admin portal's client-side
  // validation, but this is the layer that actually matters, since a
  // direct API call could bypass any UI-level check entirely.
  if (ussd_string_pattern && /\{pin\}/i.test(ussd_string_pattern)) {
    return res.status(422).json({
      success: false,
      message: 'ussd_string_pattern must never contain a {pin} placeholder. ' +
        'PIN entry is always handled by the network/OS, never by this app.',
    });
  }

  if (pin_prompt_strings !== undefined &&
      (!Array.isArray(pin_prompt_strings) || pin_prompt_strings.length === 0)) {
    return res.status(422).json({
      success: false,
      message: 'pin_prompt_strings cannot be empty — without it the app cannot ' +
        'recognize a PIN prompt and will not know to pause correctly.',
    });
  }

  if (ussd_string_pattern) {
    const usedPlaceholders = [...ussd_string_pattern.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]);
    const declared = placeholder_fields || [];
    const undeclared = usedPlaceholders.filter(p => !declared.includes(p));
    if (undeclared.length > 0) {
      return res.status(422).json({
        success: false,
        message: `Pattern uses {${undeclared.join('}, {')}} but placeholder_fields doesn't declare it.`,
      });
    }
  }

  // The Flutter engine clamps retryCount to 0-3 (see ussd_service.dart:
  // `maxAttempts = 1 + template.retryCount.clamp(0, 3)`) and NEVER
  // retries once a PIN prompt has been seen, regardless of this value —
  // it only applies to a clean "no response at all" timeout on the
  // very first dial. Reject out-of-range values here rather than
  // silently accepting a number the app will disregard, which would
  // otherwise leave an admin believing they configured 10 retries when
  // the app will only ever attempt 3.
  if (retry_count !== undefined) {
    if (!Number.isInteger(retry_count) || retry_count < 0 || retry_count > 3) {
      return res.status(422).json({
        success: false,
        message: 'retry_count must be an integer between 0 and 3. The app only ' +
          'retries a clean no-response timeout on the initial dial — it never ' +
          'retries after a PIN prompt has been seen, regardless of this value.',
      });
    }
  }

  try {
    const result = await query(
      `UPDATE ussd_templates SET
         ussd_string_pattern = COALESCE($1, ussd_string_pattern),
         placeholder_fields = COALESCE($2, placeholder_fields),
         pin_prompt_strings = COALESCE($3, pin_prompt_strings),
         success_strings = COALESCE($4, success_strings),
         failure_strings = COALESCE($5, failure_strings),
         timeout_seconds = COALESCE($6, timeout_seconds),
         retry_count = COALESCE($7, retry_count),
         is_active = COALESCE($8, is_active),
         version = version + 1, updated_at = NOW(), updated_by = $9
       WHERE id = $10 RETURNING *`,
      [ussd_string_pattern, placeholder_fields, pin_prompt_strings,
       success_strings, failure_strings, timeout_seconds, retry_count, is_active,
       req.user.id, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    if (e.code === '23514') { // CHECK constraint violation
      return res.status(422).json({
        success: false,
        message: 'ussd_string_pattern is required for an active template.',
      });
    }
    res.status(500).json({ success: false, message: 'Failed to update template' });
  }
});

// ── Audit Logs ────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  const { company_id, user_id, action, from_date, to_date, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (company_id) { conditions.push(`al.company_id = $${idx++}`); params.push(company_id); }
    if (user_id) { conditions.push(`al.user_id = $${idx++}`); params.push(user_id); }
    if (action) { conditions.push(`al.action ILIKE $${idx++}`); params.push(`%${action}%`); }
    if (from_date) { conditions.push(`al.created_at >= $${idx++}`); params.push(from_date); }
    if (to_date) { conditions.push(`al.created_at <= $${idx++}`); params.push(to_date); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT al.*, u.email as user_email, u.role as user_role
       FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
       ${where} ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch audit logs' }); }
});

// ── Moderate Ads ──────────────────────────────────────────────
router.get('/ads/pending', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, u.email as posted_by_email, ap.momo_reference, ap.amount as payment_amount
       FROM advertisements a LEFT JOIN users u ON a.posted_by = u.id
       LEFT JOIN ad_payments ap ON ap.advertisement_id = a.id AND ap.status = 'pending'
       WHERE a.status IN ('pending_review', 'pending_payment') ORDER BY a.created_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch pending ads' }); }
});

router.patch('/ads/:ad_id/moderate', async (req, res) => {
  const { action, rejection_reason } = req.body; // 'approve_review', 'reject', 'publish'
  try {
    let newStatus;
    if (action === 'approve_review') newStatus = 'pending_payment';
    else if (action === 'reject') newStatus = 'rejected';
    else if (action === 'publish') {
      newStatus = 'active';
      const durationConfig = await query("SELECT value FROM system_config WHERE key = 'ad_duration_days'");
      const gracePeriodConfig = await query("SELECT value FROM system_config WHERE key = 'ad_grace_period_days'");
      const days = parseInt(durationConfig.rows[0]?.value || 30);
      const graceDays = parseInt(gracePeriodConfig.rows[0]?.value || 7);
      const expiresAt = new Date(Date.now() + days * 86400000);
      const graceEnds = new Date(expiresAt.getTime() + graceDays * 86400000);
      await query(
        `UPDATE advertisements SET status = 'active', published_at = NOW(), expires_at = $1, grace_period_ends_at = $2, rejection_reason = NULL WHERE id = $3`,
        [expiresAt, graceEnds, req.params.ad_id]
      );
      // Verify the payment too
      await query("UPDATE ad_payments SET status = 'verified', verified_by = $1, verified_at = NOW() WHERE advertisement_id = $2 AND status = 'pending'",
        [req.user.id, req.params.ad_id]);

      const { sendAdNotification } = require('../services/notificationService');
      const ad = await query("SELECT a.posted_by, a.title, u.phone, u.first_name FROM advertisements a JOIN users u ON u.id = a.posted_by WHERE a.id = $1", [req.params.ad_id]);
      if (ad.rows.length) await sendAdNotification(ad.rows[0].posted_by, { type: 'ad_approved', adTitle: ad.rows[0].title });
        if (ad.rows.length && ad.rows[0].phone) {
          try {
            await sendAdPaymentConfirmedSMS(ad.rows[0].phone, ad.rows[0].first_name, ad.rows[0].title);
          } catch (smsErr) {
            logger.error("Failed to send ad payment confirmed SMS:", smsErr);
          }
        }

      return res.json({ success: true, message: 'Ad published' });
    }

    await query('UPDATE advertisements SET status = $1, rejection_reason = $2 WHERE id = $3', [newStatus, rejection_reason, req.params.ad_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to moderate ad' }); }
});

module.exports = router;
