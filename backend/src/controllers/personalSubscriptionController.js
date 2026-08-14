const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendToUser } = require('../services/notificationService');

// ─── Get Own Personal Subscription Status ─────────────────────

exports.getSubscription = async (req, res) => {
  try {
    const result = await query(
      'SELECT plan, expires_at, created_at FROM personal_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal capability is not enabled for this account.' });
    }

    // Same merchant MoMo number Business subscriptions already pay
    // into (system_config key 'agent_pro_momo_number') - one merchant
    // account for the whole app, not a separate one per plan type.
    const config = await query(
      "SELECT value FROM system_config WHERE key = 'agent_pro_momo_number'",
    );

    res.json({
      success: true,
      data: {
        subscription: result.rows[0],
        payment_instructions: {
          merchant_number: config.rows[0]?.value || '',
          merchant_name: 'Agent Pro Ghana',
          amount: 5.00,
          currency: 'GHS',
          note: 'Pay GH₵5.00 via MTN MoMo, then submit your transaction reference below.',
        },
      },
    });
  } catch (error) {
    logger.error('Get personal subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription status' });
  }
};

// ─── Submit Payment ─────────────────────────────────────────
// Flat GH₵5/month - doesn't accept an amount from the client, matching
// the fixed pricing (unlike Business subscriptions/ad fees, which are
// percentage-based and vary).

exports.submitPayment = async (req, res) => {
  const { momo_reference, payment_phone } = req.body;

  try {
    let result;
    let pendingExists = false;

    // requirePersonalAccount guarantees this row exists on the public
    // route. Lock it so concurrent submissions for the same Personal
    // account cannot both pass the pending-payment check.
    await withTransaction(async (client) => {
      await client.query(
        'SELECT user_id FROM personal_subscriptions WHERE user_id = $1 FOR UPDATE',
        [req.user.id]
      );

      const pending = await client.query(
        `SELECT id
         FROM personal_subscription_payments
         WHERE user_id = $1
           AND status = 'pending'
         LIMIT 1`,
        [req.user.id]
      );

      if (pending.rows.length > 0) {
        pendingExists = true;
        return;
      }

      result = await client.query(
        `INSERT INTO personal_subscription_payments (user_id, amount, momo_reference, payment_phone)
         VALUES ($1, 5.00, $2, $3) RETURNING *`,
        [req.user.id, momo_reference, payment_phone]
      );
    });

    if (pendingExists) {
      return res.status(409).json({
        success: false,
        message: 'You already have a payment under review. Please wait for verification.',
      });
    }

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Payment submitted for verification.',
    });
  } catch (error) {
    logger.error('Submit personal subscription payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit payment' });
  }
};

// ─── Verify Payment (Superuser) ────────────────────────────────

exports.verifyPayment = async (req, res) => {
  const { payment_id } = req.params;
  const { action, rejection_reason } = req.body; // 'approve' or 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Action must be approve or reject',
    });
  }

  try {
    let payment;
    let verificationError = null;
    let approvedExpiresAt = null;

    await withTransaction(async (client) => {
      const paymentResult = await client.query(
        'SELECT * FROM personal_subscription_payments WHERE id = $1 FOR UPDATE',
        [payment_id]
      );

      if (paymentResult.rows.length === 0) {
        verificationError = {
          status: 404,
          message: 'Payment not found',
        };
        return;
      }

      payment = paymentResult.rows[0];

      if (payment.status !== 'pending') {
        verificationError = {
          status: 400,
          message: `Payment already ${payment.status}`,
        };
        return;
      }

      if (action === 'approve') {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const sub = await client.query(
          'SELECT * FROM personal_subscriptions WHERE user_id = $1',
          [payment.user_id]
        );

        // If already paid and not yet expired, extend from current
        // expiry rather than from now - same convention already used
        // for Business subscriptions.
        if (sub.rows[0]?.plan === 'paid' && sub.rows[0].expires_at > now) {
          expiresAt.setTime(new Date(sub.rows[0].expires_at).getTime());
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        approvedExpiresAt = expiresAt;

        await client.query(
          `UPDATE personal_subscriptions SET plan = 'paid', expires_at = $1, updated_at = NOW() WHERE user_id = $2`,
          [expiresAt, payment.user_id]
        );

        await client.query(
          `UPDATE personal_subscription_payments SET status = 'verified', verified_at = NOW(), verified_by = $1 WHERE id = $2`,
          [req.user.id, payment_id]
        );
      } else {
        await client.query(
          `UPDATE personal_subscription_payments SET status = 'rejected', verified_at = NOW(), verified_by = $1, rejection_reason = $2 WHERE id = $3`,
          [req.user.id, rejection_reason || null, payment_id]
        );
      }

      await auditLog({
        userId: req.user.id,
        companyId: null,
        action: action === 'approve' ? 'PERSONAL_SUBSCRIPTION_PAYMENT_VERIFIED' : 'PERSONAL_SUBSCRIPTION_PAYMENT_REJECTED',
        entityType: 'personal_subscription_payment',
        entityId: payment_id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId
      });
    });

    if (verificationError) {
      return res.status(verificationError.status).json({
        success: false,
        message: verificationError.message,
      });
    }

    await sendToUser(payment.user_id, {
      type: action === 'approve'
        ? 'personal_subscription_approved'
        : 'personal_subscription_rejected',
      title: action === 'approve'
        ? '✅ Personal Subscription Activated'
        : '❌ Personal Subscription Payment Not Verified',
      body: action === 'approve'
        ? `Your Personal Plan is active until ${approvedExpiresAt.toLocaleDateString('en-GH')}.`
        : `Your Personal subscription payment could not be verified. Reason: ${rejection_reason || 'Please contact support.'}`,
      data: action === 'approve'
        ? { expires_at: approvedExpiresAt.toISOString() }
        : {},
    });

    res.json({
      success: true,
      message: action === 'approve' ? 'Payment verified — Personal subscription activated.' : 'Payment rejected.'
    });

  } catch (error) {
    logger.error('Verify personal subscription payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment verification' });
  }
};

// ─── List Pending Payments (Superuser) ─────────────────────────

exports.listPendingPayments = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.first_name, u.last_name, u.email
       FROM personal_subscription_payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.status = 'pending'
       ORDER BY p.submitted_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List pending personal subscription payments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending payments' });
  }
};
