const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const {
  sendWelcomeEmail,
  sendSubscriptionRenewalEmail,
  sendSubscriptionReminderEmail,
} = require('../services/emailService');
const { sendSubscriptionRenewalSMS } = require('../services/smsService');
const { sendToUser, sendToCompany, sendSubscriptionSuspended } = require('../services/notificationService');
const { activateBusinessSubscription } = require('../services/subscriptionActivationService');

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
          merchant_name: 'AgentPro',
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
  const { momo_reference, payment_phone, notes } = req.body;
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

    // Serialize payment submission for this subscription. Every
    // competing request must acquire the same subscription-row lock
    // before checking for an existing pending payment.
    let payment;
    let pendingExists = false;

    await withTransaction(async (client) => {
      const lockedSubscription = await client.query(
        'SELECT id, status, expires_at FROM subscriptions WHERE id = $1 FOR UPDATE',
        [sub.id]
      );

      const lockedSub = lockedSubscription.rows[0];

      const entitlementBase =
        lockedSub.status === 'active' &&
        lockedSub.expires_at &&
        new Date(lockedSub.expires_at) > new Date()
          ? lockedSub.expires_at
          : null;

      const pending = await client.query(
        `SELECT id FROM subscription_payments
         WHERE subscription_id = $1
           AND status IN ('pending', 'submitted')`,
        [sub.id]
      );

      if (pending.rows.length > 0) {
        pendingExists = true;
        return;
      }

      payment = await client.query(
        `INSERT INTO subscription_payments
           (
             subscription_id,
             company_id,
             amount,
             momo_reference,
             payment_phone,
             notes,
             payment_provider,
             entitlement_base_expires_at,
             entitlement_base_captured
           )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           'manual_momo', $7, TRUE
         )
         RETURNING *`,
        [
          sub.id,
          companyId,
          billing.amount,
          momo_reference,
          payment_phone,
          notes,
          entitlementBase,
        ]
      );

      await auditLog({
        userId: req.user.id,
        companyId,
        action: 'SUBSCRIPTION_PAYMENT_SUBMITTED',
        entityType: 'subscription_payment',
        entityId: payment.rows[0].id,
        newValues: {
          momo_reference,
          amount: billing.amount,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });
    });

    if (pendingExists) {
      return res.status(409).json({
        success: false,
        message: 'You already have a payment under review. Please wait for verification.',
      });
    }

    // Notification delivery is post-commit and best-effort. A push
    // failure must never make a successfully submitted payment look failed.
    try {
      const superusers = await query(
        "SELECT id FROM users WHERE role = 'superuser' AND status = 'active'"
      );

      const { sendToMultiple } =
        require('../services/notificationService');

      await sendToMultiple(
        superusers.rows.map((user) => user.id),
        {
          type: 'system_update',
          title: '💳 New Subscription Payment',
          body:
            `Payment reference ${momo_reference} submitted. ` +
            'Awaiting verification.',
          data: {
            payment_id: payment.rows[0].id,
          },
        }
      );
    } catch (notificationError) {
      logger.error(
        'Subscription payment notification error:',
        notificationError
      );
    }

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

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Action must be approve or reject',
    });
  }

  try {
    let payment;
    let verificationError = null;
    let owner = null;
    let companyName = null;
    let approvedExpiresAt = null;
    let approvedPaymentWasRenewal = false;

    await withTransaction(async (client) => {
      const paymentResult = await client.query(
        'SELECT * FROM subscription_payments WHERE id = $1 FOR UPDATE',
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

      if (payment.status !== 'pending' && payment.status !== 'submitted') {
        verificationError = {
          status: 400,
          message: `Payment already ${payment.status}`,
        };
        return;
      }

      if (payment.payment_provider === 'paystack') {
        verificationError = {
          status: 409,
          message:
            'Paystack payments are verified automatically and cannot be manually approved or rejected.',
        };
        return;
      }

      if (action === 'approve') {
        const activation =
          await activateBusinessSubscription({
            client,
            payment,
            verifiedBy: req.user.id,
            providerStatus: 'manual_verified',
          });

        approvedPaymentWasRenewal =
          activation.wasRenewal === true;

        if (activation.outcome !== 'activated') {
          await client.query(
            `UPDATE subscription_payments
             SET status = 'rejected',
                 provider_status = 'superseded',
                 verified_at = NOW(),
                 verified_by = $1,
                 rejection_reason =
                   'This subscription cycle was already fulfilled by another payment.'
             WHERE id = $2`,
            [
              req.user.id,
              payment_id,
            ]
          );

          await auditLog({
            userId: req.user.id,
            companyId: payment.company_id,
            action:
              'SUBSCRIPTION_PAYMENT_SUPERSEDED',
            entityType:
              'subscription_payment',
            entityId: payment_id,
            newValues: {
              payment_provider:
                payment.payment_provider ||
                'manual_momo',
            },
            ipAddress: req.ip,
            requestId: req.requestId,
            dbClient: client,
            strict: true,
          });

          verificationError = {
            status: 409,
            message:
              'This subscription cycle was already fulfilled by another payment.',
          };

          return;
        }

        approvedExpiresAt =
          activation.expiresAt;

      } else {
        await client.query(
          `UPDATE subscription_payments
           SET status = 'rejected',
               provider_status = 'manual_rejected',
               verified_at = NOW(),
               verified_by = $1,
               rejection_reason = $2
           WHERE id = $3`,
          [req.user.id, rejection_reason, payment_id]
        );
      }

      const ownerResult = await client.query(
        `SELECT id, email, first_name, phone
         FROM users
         WHERE company_id = $1
           AND role = 'business_owner'
         LIMIT 1`,
        [payment.company_id]
      );

      owner = ownerResult.rows[0] || null;

      if (action === 'approve' && owner) {
        const companyResult = await client.query(
          'SELECT name FROM companies WHERE id = $1',
          [payment.company_id]
        );

        companyName = companyResult.rows[0]?.name || null;
      }

      const verificationAuditAction =
        action === 'approve'
          ? 'SUBSCRIPTION_PAYMENT_APPROVED'
          : 'SUBSCRIPTION_PAYMENT_REJECTED';

      await auditLog({
        userId: req.user.id,
        companyId: payment.company_id,
        action: verificationAuditAction,
        entityType: 'subscription_payment',
        entityId: payment_id,
        newValues: {
          action,
          rejection_reason,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });
    });

    if (verificationError) {
      return res.status(verificationError.status).json({
        success: false,
        message: verificationError.message,
      });
    }

    // External side effects happen only after the database transaction
    // commits. Notification failures must not undo a verified payment.
    if (owner) {
      if (action === 'approve') {
        try {
          if (approvedPaymentWasRenewal) {
            await sendSubscriptionRenewalEmail(
              owner.email,
              owner.first_name,
              companyName,
              payment.amount,
              approvedExpiresAt
            );
          } else {
            await sendWelcomeEmail(
              owner.email,
              owner.first_name,
              companyName
            );
          }
        } catch (emailErr) {
          logger.error(
            approvedPaymentWasRenewal
              ? 'Failed to send subscription renewal email:'
              : 'Failed to send subscription welcome email:',
            emailErr
          );
        }

        try {
          await sendToUser(owner.id, {
            type: 'renewal_approved',
            title: '✅ Subscription Activated!',
            body:
              `Your Business Plan is now active until ` +
              `${approvedExpiresAt.toLocaleDateString('en-GH')}.`,
            data: {
              expires_at: approvedExpiresAt.toISOString(),
            },
          });
        } catch (notificationError) {
          logger.error(
            'Subscription approval notification error:',
            notificationError
          );
        }

        if (owner.phone) {
          try {
            await sendSubscriptionRenewalSMS(
              owner.phone,
              owner.first_name,
              payment.amount,
              approvedExpiresAt.toLocaleDateString('en-GH')
            );
          } catch (smsErr) {
            logger.error(
              'Failed to send subscription renewal SMS:',
              smsErr
            );
          }
        }
      } else {
        try {
          await sendToUser(owner.id, {
            type: 'system_update',
            title: '❌ Payment Not Verified',
            body:
              `Your subscription payment could not be verified. ` +
              `Reason: ${rejection_reason || 'Please contact support.'}`,
            data: {},
          });
        } catch (notificationError) {
          logger.error(
            'Subscription rejection notification error:',
            notificationError
          );
        }
      }
    }

    res.json({
      success: true,
      message:
        `Payment ${
          action === 'approve'
            ? 'approved and subscription activated'
            : 'rejected'
        }`,
    });
  } catch (error) {
    logger.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
    });
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
         AND sp.payment_provider = 'manual_momo'
       ORDER BY sp.submitted_at ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List pending payments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending payments' });
  }
};

// ── List Paystack Reconciliation Payments (Superuser) ─────────

exports.listReconciliationPayments = async (req, res) => {
  try {
    const result = await query(
      `SELECT sp.*,
              'business' AS account_mode,
              c.name AS company_name,
              u.first_name,
              u.last_name,
              u.email
       FROM subscription_payments sp
       INNER JOIN companies c
         ON c.id = sp.company_id
       INNER JOIN users u
         ON u.company_id = c.id
        AND u.role = 'business_owner'
       WHERE sp.payment_provider = 'paystack'
         AND sp.reconciliation_required = TRUE
       ORDER BY COALESCE(
         sp.verified_at,
         sp.submitted_at
       ) ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error(
      'List Business Paystack reconciliation payments error:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to fetch Business Paystack reconciliation payments',
    });
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
