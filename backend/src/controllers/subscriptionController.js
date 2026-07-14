const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendWelcomeEmail, sendSubscriptionReminderEmail } = require('../services/emailService');
const { sendSubscriptionRenewalSMS } = require('../services/smsService');
const { sendToUser, sendToCompany, sendSubscriptionSuspended } = require('../services/notificationService');

// ── Get Subscription Status ───────────────────────────────────

exports.getSubscription = async (req, res) => {
  const companyId = req.user.role === 'superuser'
    ? req.params.company_id
    : req.user.company_id;

  try {
    const result = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM subscription_payments sp WHERE sp.subscription_id = s.id) as payment_count
       FROM subscriptions s
       WHERE s.company_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No subscription found' });
    }

    // Get merchant number from config
    const config = await query(
      "SELECT value FROM system_config WHERE key = 'agent_pro_momo_number'",
    );
    const billing = await calculateSeatBilling(companyId);

    res.json({
      success: true,
      data: {
        subscription: result.rows[0],
        payment_instructions: {
          merchant_number: config.rows[0]?.value || '',
          merchant_name: 'Agent Pro Ghana',
          amount: billing.amount,
          currency: 'GHS',
          note: `Pay GH₵${billing.amount.toFixed(2)} via MTN MoMo (${billing.paidSeats} paid seat${billing.paidSeats !== 1 ? 's' : ''}, ${billing.freeSeats} free), then submit your transaction reference below.`,
        },
      },
    });
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
  }
};

// ── Submit Payment Reference ──────────────────────────────────

exports.submitPayment = async (req, res) => {
  const { momo_reference, payment_phone, amount, notes } = req.body;
  const companyId = req.user.company_id;

  try {
    const billing = await calculateSeatBilling(companyId);
    const subResult = await query(
      'SELECT * FROM subscriptions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1',
      [companyId]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const sub = subResult.rows[0];

    // Check no pending payment already exists
    const pending = await query(
      `SELECT id FROM subscription_payments
       WHERE subscription_id = $1 AND status = 'pending'`,
      [sub.id]
    );

    if (pending.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have a payment under review. Please wait for verification.',
      });
    }

    const payment = await query(
      `INSERT INTO subscription_payments
         (subscription_id, company_id, amount, momo_reference, payment_phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [sub.id, companyId, amount || billing.amount, momo_reference, payment_phone, notes]
    );

    await auditLog({
      userId: req.user.id,
      companyId,
      action: 'SUBSCRIPTION_PAYMENT_SUBMITTED',
      entityType: 'subscription_payment',
      entityId: payment.rows[0].id,
      newValues: { momo_reference, amount },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    // Notify superuser (get all superuser IDs)
    const superusers = await query("SELECT id FROM users WHERE role = 'superuser' AND status = 'active'");
    const { sendToMultiple } = require('../services/notificationService');
    await sendToMultiple(superusers.rows.map(u => u.id), {
      type: 'system_update',
      title: '💳 New Subscription Payment',
      body: `Payment reference ${momo_reference} submitted. Awaiting verification.`,
      data: { payment_id: payment.rows[0].id },
    });

    res.status(201).json({
      success: true,
      message: 'Payment reference submitted. Your subscription will be activated once verified (usually within 24 hours).',
      data: payment.rows[0],
    });
  } catch (error) {
    logger.error('Submit payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit payment' });
  }
};

// ── Verify Payment (Superuser) ────────────────────────────────

exports.verifyPayment = async (req, res) => {
  const { payment_id } = req.params;
  const { action, rejection_reason } = req.body; // 'approve' or 'reject'

  try {
    const paymentResult = await query(
      'SELECT * FROM subscription_payments WHERE id = $1',
      [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'pending' && payment.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: `Payment already ${payment.status}`,
      });
    }

    await withTransaction(async (client) => {
      if (action === 'approve') {
        // Activate subscription
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + (payment.period_months || 1));

        const sub = await client.query(
          'SELECT * FROM subscriptions WHERE id = $1',
          [payment.subscription_id]
        );

        // If already active, extend from current expiry
        let startFrom = now;
        if (sub.rows[0].status === 'active' && sub.rows[0].expires_at > now) {
          startFrom = new Date(sub.rows[0].expires_at);
          expiresAt.setTime(startFrom.getTime());
          expiresAt.setMonth(expiresAt.getMonth() + (payment.period_months || 1));
        }

        const graceEnds = new Date(expiresAt);
        graceEnds.setDate(graceEnds.getDate() + 7);

        await client.query(
          `UPDATE subscriptions
           SET plan = 'business', status = 'active',
               started_at = COALESCE(started_at, $1),
               expires_at = $2, grace_period_ends_at = $3
           WHERE id = $4`,
          [startFrom, expiresAt, graceEnds, payment.subscription_id]
        );

        await client.query(
          `UPDATE subscription_payments
           SET status = 'verified', verified_at = NOW(), verified_by = $1
           WHERE id = $2`,
          [req.user.id, payment_id]
        );

        // Activate company if still pending
        await client.query(
          "UPDATE companies SET status = 'active', approved_at = NOW(), approved_by = $1 WHERE id = $2 AND status = 'pending'",
          [req.user.id, payment.company_id]
        );
        await client.query(
          "UPDATE users SET status = 'active' WHERE company_id = $1 AND status = 'pending'",
          [payment.company_id]
        );

        // Notify business owner
        const owner = await client.query(
          "SELECT * FROM users WHERE company_id = $1 AND role = 'business_owner' LIMIT 1",
          [payment.company_id]
        );

        if (owner.rows.length > 0) {
          await sendWelcomeEmail(owner.rows[0].email, owner.rows[0].first_name,
            (await client.query('SELECT name FROM companies WHERE id = $1', [payment.company_id])).rows[0]?.name);
          await sendToUser(owner.rows[0].id, {
            type: 'renewal_approved',
            title: '✅ Subscription Activated!',
            body: `Your Business Plan is now active until ${expiresAt.toLocaleDateString('en-GH')}.`,
            data: { expires_at: expiresAt.toISOString() },
          });
          if (owner.rows[0].phone) {
            try {
              await sendSubscriptionRenewalSMS(owner.rows[0].phone, owner.rows[0].first_name, payment.amount, expiresAt.toLocaleDateString("en-GH"));
            } catch (smsErr) {
              logger.error("Failed to send subscription renewal SMS:", smsErr);
            }
          }
        }

      } else if (action === 'reject') {
        await client.query(
          `UPDATE subscription_payments
           SET status = 'rejected', verified_at = NOW(), verified_by = $1, rejection_reason = $2
           WHERE id = $3`,
          [req.user.id, rejection_reason, payment_id]
        );

        // Notify business owner
        const owner = await client.query(
          "SELECT id FROM users WHERE company_id = $1 AND role = 'business_owner' LIMIT 1",
          [payment.company_id]
        );
        if (owner.rows.length > 0) {
          await sendToUser(owner.rows[0].id, {
            type: 'system_update',
            title: '❌ Payment Not Verified',
            body: `Your subscription payment could not be verified. Reason: ${rejection_reason || 'Please contact support.'}`,
            data: {},
          });
        }
      }
    });

    await auditLog({
      userId: req.user.id,
      action: `SUBSCRIPTION_PAYMENT_${action.toUpperCase()}ED`,
      entityType: 'subscription_payment',
      entityId: payment_id,
      newValues: { action, rejection_reason },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: `Payment ${action === 'approve' ? 'approved and subscription activated' : 'rejected'}`,
    });
  } catch (error) {
    logger.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
};

// ── List Pending Payments (Superuser) ─────────────────────────

exports.listPendingPayments = async (req, res) => {
  try {
    const result = await query(
      `SELECT sp.*, c.name as company_name,
              u.first_name || ' ' || u.last_name as submitted_by_name,
              u.email as submitted_by_email
       FROM subscription_payments sp
       INNER JOIN companies c ON sp.company_id = c.id
       INNER JOIN users u ON c.id = u.company_id AND u.role = 'business_owner'
       WHERE sp.status = 'pending'
       ORDER BY sp.submitted_at ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List pending payments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending payments' });
  }
};

// ── Subscription Renewal Reminder Job (called by cron) ───────

exports.sendRenewalReminders = async () => {
  try {
    const result = await query(
      `SELECT s.company_id, s.expires_at,
              EXTRACT(DAY FROM s.expires_at - NOW())::int as days_left
       FROM subscriptions s
       WHERE s.status = 'active'
         AND s.expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );

    for (const sub of result.rows) {
      const daysLeft = sub.days_left;
      if ([7, 3, 1].includes(daysLeft)) {
        await sendSubscriptionReminder(sub.company_id, daysLeft);

        // Also send email
        const owner = await query(
          "SELECT email, first_name FROM users WHERE company_id = $1 AND role = 'business_owner' LIMIT 1",
          [sub.company_id]
        );
        if (owner.rows.length > 0) {
          await sendSubscriptionReminderEmail(
            owner.rows[0].email,
            owner.rows[0].first_name,
            daysLeft,
            sub.expires_at
          );
        }
      }
    }

    // Suspend overdue subscriptions (past grace period)
    const overdue = await query(
      `SELECT company_id FROM subscriptions
       WHERE status IN ('active', 'grace_period')
         AND grace_period_ends_at < NOW()`
    );

    for (const sub of overdue.rows) {
      await query(
        "UPDATE subscriptions SET status = 'suspended' WHERE company_id = $1",
        [sub.company_id]
      );
      await sendSubscriptionSuspended(sub.company_id);
    }

    logger.info(`Renewal reminders sent. Suspended ${overdue.rows.length} overdue subscriptions.`);
  } catch (error) {
    logger.error('Renewal reminder job error:', error);
  }
};

// Per-seat billing: every 5th active staff member (including the
// owner) is free; the rest are paid at GH10.00 each.
// paid_seats = total_seats - floor(total_seats / 5)
async function calculateSeatBilling(companyId) {
  const result = await query(
    "SELECT COUNT(*) as count FROM users WHERE company_id = $1 AND status = $2",
    [companyId, "active"]
  );
  const totalSeats = parseInt(result.rows[0].count, 10);
  const freeSeats = Math.floor(totalSeats / 5);
  const paidSeats = totalSeats - freeSeats;
  const pricePerSeat = 10.00;
  const amount = paidSeats * pricePerSeat;
  return { totalSeats, paidSeats, freeSeats, pricePerSeat, amount };
}
