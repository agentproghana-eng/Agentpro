const { v4: uuidv4 } = require("uuid");

const { query, withTransaction } = require("../config/database");

const { logger } = require("../utils/logger");

const { auditLog } = require("../services/auditService");

const {
  amountToMinorUnits,
  initializeTransaction,
  verifyTransaction,
} = require("../services/paystackService");

const {
  fulfillPaystackTransaction,
} = require("../services/paystackSubscriptionService");

const TERMINAL_PROVIDER_STATUSES = new Set(["abandoned", "failed", "reversed"]);

function currentEntitlementBase({ active, expiresAt }) {
  if (!active || !expiresAt) {
    return null;
  }

  const expiry = new Date(expiresAt);

  if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
    return null;
  }

  return expiry;
}

function businessReference() {
  return "APG-BSUB-" + uuidv4();
}

function personalReference() {
  return "APG-PSUB-" + uuidv4();
}

async function rejectInitializationFailure({ table, paymentId }) {
  try {
    await query(
      `UPDATE ${table}
       SET status = 'rejected',
           provider_status =
             'initialization_failed',
           verified_at = NOW(),
           rejection_reason =
             'Paystack checkout could not be initialized.'
       WHERE id = $1
         AND status = 'submitted'`,
      [paymentId],
    );
  } catch (error) {
    logger.error("Failed to record Paystack initialization failure:", error);
  }
}

async function recordProviderVerification({ table, paymentId, data }) {
  const status = String(data?.status || "")
    .trim()
    .toLowerCase();

  const terminal = TERMINAL_PROVIDER_STATUSES.has(status);

  await query(
    `UPDATE ${table}
     SET provider_transaction_id = $1,
         provider_status = $2,
         provider_channel = $3,
         provider_currency = $4,
         status =
           CASE
             WHEN $5
               AND status = 'submitted'
             THEN 'rejected'::payment_status
             ELSE status
           END,
         verified_at =
           CASE
             WHEN $5
               AND status = 'submitted'
             THEN NOW()
             ELSE verified_at
           END,
         rejection_reason =
           CASE
             WHEN $5
               AND status = 'submitted'
             THEN $6
             ELSE rejection_reason
           END
     WHERE id = $7`,
    [
      data?.id === undefined || data?.id === null ? null : String(data.id),
      status || null,
      data?.channel ? String(data.channel) : null,
      data?.currency ? String(data.currency).toUpperCase() : null,
      terminal,
      terminal ? `Paystack transaction ${status}.` : null,
      paymentId,
    ],
  );
}

exports.initializeBusiness = async (req, res) => {
  const companyId = req.user.company_id;

  let payment = null;
  let email = null;
  let amount = null;
  let amountMinor = null;
  let conflict = null;

  try {
    await withTransaction(async (client) => {
      const subscriptionResult = await client.query(
        `SELECT *
               FROM subscriptions
               WHERE company_id = $1
               ORDER BY created_at DESC
               LIMIT 1
               FOR UPDATE`,
        [companyId],
      );

      if (subscriptionResult.rows.length === 0) {
        conflict = {
          status: 404,
          message: "Subscription not found",
        };

        return;
      }

      const subscription = subscriptionResult.rows[0];

      const openPayment = await client.query(
        `SELECT id,
                      payment_provider,
                      status
               FROM subscription_payments
               WHERE subscription_id = $1
                 AND status IN (
                   'pending',
                   'submitted'
                 )
               LIMIT 1`,
        [subscription.id],
      );

      if (openPayment.rows.length > 0) {
        conflict = {
          status: 409,
          message:
            "A subscription payment is already in progress or awaiting verification.",
        };

        return;
      }

      const seatResult = await client.query(
        `SELECT COUNT(*) AS count
               FROM users
               WHERE company_id = $1
                 AND status = 'active'`,
        [companyId],
      );

      const totalSeats = Number.parseInt(seatResult.rows[0]?.count || "0", 10);

      const freeSeats = Math.floor(totalSeats / 5);

      const paidSeats = totalSeats - freeSeats;

      amount = paidSeats * 10;

      if (!Number.isFinite(amount) || amount <= 0) {
        conflict = {
          status: 409,
          message: "There are no billable active seats for this subscription.",
        };

        return;
      }

      amountMinor = amountToMinorUnits(amount);

      const ownerResult = await client.query(
        `SELECT email
               FROM users
               WHERE id = $1
                 AND company_id = $2
                 AND role =
                   'business_owner'
               LIMIT 1`,
        [req.user.id, companyId],
      );

      email = ownerResult.rows[0]?.email || req.user.email || null;

      if (!email) {
        conflict = {
          status: 422,
          message: "A valid account email is required for Paystack checkout.",
        };

        return;
      }

      const reference = businessReference();

      const baseExpiry = currentEntitlementBase({
        active: subscription.status === "active",
        expiresAt: subscription.expires_at,
      });

      const insert = await client.query(
        `INSERT INTO subscription_payments (
                 subscription_id,
                 company_id,
                 amount,
                 status,
                 payment_provider,
                 provider_reference,
                 provider_currency,
                 expected_amount_minor,
                 entitlement_base_expires_at,
                 entitlement_base_captured,
                 notes
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 'submitted',
                 'paystack',
                 $4,
                 'GHS',
                 $5,
                 $6,
                 TRUE,
                 $7
               )
               RETURNING *`,
        [
          subscription.id,
          companyId,
          amount,
          reference,
          amountMinor,
          baseExpiry,
          "Paystack checkout",
        ],
      );

      payment = insert.rows[0];

      await auditLog({
        userId: req.user.id,
        companyId,
        action: "PAYSTACK_SUBSCRIPTION_PAYMENT_INITIALIZED",
        entityType: "subscription_payment",
        entityId: payment.id,
        newValues: {
          reference,
          amount,
          amount_minor: amountMinor,
          currency: "GHS",
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });
    });

    if (conflict) {
      return res.status(conflict.status).json({
        success: false,
        message: conflict.message,
      });
    }

    const checkout = await initializeTransaction({
      email,
      amountMinor,
      reference: payment.provider_reference,
      metadata: {
        account_mode: "business",
        payment_id: payment.id,
        company_id: companyId,
      },
    });

    await query(
      `UPDATE subscription_payments
         SET authorization_url = $1,
             provider_status =
               'initialized'
         WHERE id = $2`,
      [checkout.authorization_url, payment.id],
    );

    return res.status(201).json({
      success: true,
      message: "Paystack checkout initialized.",
      data: {
        payment_id: payment.id,
        reference: payment.provider_reference,
        authorization_url: checkout.authorization_url,
        access_code: checkout.access_code,
        amount,
        amount_minor: amountMinor,
        currency: "GHS",
      },
    });
  } catch (error) {
    if (payment?.id) {
      await rejectInitializationFailure({
        table: "subscription_payments",
        paymentId: payment.id,
      });
    }

    logger.error("Initialize Business Paystack payment error:", error);

    return res
      .status(error?.code === "PAYSTACK_NOT_CONFIGURED" ? 503 : 502)
      .json({
        success: false,
        message:
          error?.code === "PAYSTACK_NOT_CONFIGURED"
            ? "Paystack payments are temporarily unavailable."
            : "Paystack checkout could not be initialized.",
      });
  }
};

exports.initializePersonal = async (req, res) => {
  let payment = null;
  let email = null;
  let conflict = null;

  const amount = 5;

  const amountMinor = amountToMinorUnits(amount);

  try {
    await withTransaction(async (client) => {
      const subscriptionResult = await client.query(
        `SELECT *
               FROM personal_subscriptions
               WHERE user_id = $1
               FOR UPDATE`,
        [req.user.id],
      );

      if (subscriptionResult.rows.length === 0) {
        conflict = {
          status: 404,
          message: "Personal subscription not found",
        };

        return;
      }

      const subscription = subscriptionResult.rows[0];

      const openPayment = await client.query(
        `SELECT id,
                      payment_provider,
                      status
               FROM personal_subscription_payments
               WHERE user_id = $1
                 AND status IN (
                   'pending',
                   'submitted'
                 )
               LIMIT 1`,
        [req.user.id],
      );

      if (openPayment.rows.length > 0) {
        conflict = {
          status: 409,
          message:
            "A subscription payment is already in progress or awaiting verification.",
        };

        return;
      }

      const userResult = await client.query(
        `SELECT email
               FROM users
               WHERE id = $1
               LIMIT 1`,
        [req.user.id],
      );

      email = userResult.rows[0]?.email || req.user.email || null;

      if (!email) {
        conflict = {
          status: 422,
          message: "A valid account email is required for Paystack checkout.",
        };

        return;
      }

      const reference = personalReference();

      const baseExpiry = currentEntitlementBase({
        active: subscription.plan === "paid",
        expiresAt: subscription.expires_at,
      });

      const insert = await client.query(
        `INSERT INTO personal_subscription_payments (
                 user_id,
                 amount,
                 status,
                 payment_provider,
                 provider_reference,
                 provider_currency,
                 expected_amount_minor,
                 entitlement_base_expires_at,
                 entitlement_base_captured
               )
               VALUES (
                 $1,
                 $2,
                 'submitted',
                 'paystack',
                 $3,
                 'GHS',
                 $4,
                 $5,
                 TRUE
               )
               RETURNING *`,
        [req.user.id, amount, reference, amountMinor, baseExpiry],
      );

      payment = insert.rows[0];

      await auditLog({
        userId: req.user.id,
        companyId: null,
        action: "PAYSTACK_PERSONAL_SUBSCRIPTION_PAYMENT_INITIALIZED",
        entityType: "personal_subscription_payment",
        entityId: payment.id,
        newValues: {
          reference,
          amount,
          amount_minor: amountMinor,
          currency: "GHS",
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });
    });

    if (conflict) {
      return res.status(conflict.status).json({
        success: false,
        message: conflict.message,
      });
    }

    const checkout = await initializeTransaction({
      email,
      amountMinor,
      reference: payment.provider_reference,
      metadata: {
        account_mode: "personal",
        payment_id: payment.id,
        user_id: req.user.id,
      },
    });

    await query(
      `UPDATE personal_subscription_payments
         SET authorization_url = $1,
             provider_status =
               'initialized'
         WHERE id = $2`,
      [checkout.authorization_url, payment.id],
    );

    return res.status(201).json({
      success: true,
      message: "Paystack checkout initialized.",
      data: {
        payment_id: payment.id,
        reference: payment.provider_reference,
        authorization_url: checkout.authorization_url,
        access_code: checkout.access_code,
        amount,
        amount_minor: amountMinor,
        currency: "GHS",
      },
    });
  } catch (error) {
    if (payment?.id) {
      await rejectInitializationFailure({
        table: "personal_subscription_payments",
        paymentId: payment.id,
      });
    }

    logger.error("Initialize Personal Paystack payment error:", error);

    return res
      .status(error?.code === "PAYSTACK_NOT_CONFIGURED" ? 503 : 502)
      .json({
        success: false,
        message:
          error?.code === "PAYSTACK_NOT_CONFIGURED"
            ? "Paystack payments are temporarily unavailable."
            : "Paystack checkout could not be initialized.",
      });
  }
};

async function verifyOwnedPayment({
  req,
  res,
  table,
  ownershipSql,
  ownershipParams,
}) {
  try {
    const paymentResult = await query(ownershipSql, ownershipParams);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Paystack payment not found.",
      });
    }

    const payment = paymentResult.rows[0];

    const provider = await verifyTransaction(payment.provider_reference);

    const providerStatus = String(provider?.status || "")
      .trim()
      .toLowerCase();

    if (providerStatus !== "success") {
      await recordProviderVerification({
        table,
        paymentId: payment.id,
        data: provider,
      });

      return res.json({
        success: true,
        message: "Payment has not been confirmed as successful yet.",
        data: {
          reference: payment.provider_reference,
          provider_status: providerStatus,
          activated: false,
        },
      });
    }

    const fulfillment = await fulfillPaystackTransaction(provider, {
      source: "verify_api",
      actorUserId: req.user.id,
    });

    return res.json({
      success: true,
      message:
        fulfillment.outcome === "activated"
          ? "Payment verified and subscription activated."
          : fulfillment.outcome === "already_fulfilled"
            ? "Payment was already verified."
            : "Payment verification completed.",
      data: {
        reference: payment.provider_reference,
        provider_status: providerStatus,
        fulfillment: fulfillment.outcome,
        activated: ["activated", "already_fulfilled"].includes(
          fulfillment.outcome,
        ),
      },
    });
  } catch (error) {
    logger.error("Verify Paystack subscription payment error:", error);

    return res
      .status(error?.code === "PAYSTACK_NOT_CONFIGURED" ? 503 : 502)
      .json({
        success: false,
        message: "Paystack payment verification is temporarily unavailable.",
      });
  }
}

exports.verifyBusiness = async (req, res) =>
  verifyOwnedPayment({
    req,
    res,
    table: "subscription_payments",
    ownershipSql: `SELECT *
         FROM subscription_payments
         WHERE company_id = $1
           AND payment_provider =
             'paystack'
           AND provider_reference =
             $2
         LIMIT 1`,
    ownershipParams: [req.user.company_id, req.params.reference],
  });

exports.verifyPersonal = async (req, res) =>
  verifyOwnedPayment({
    req,
    res,
    table: "personal_subscription_payments",
    ownershipSql: `SELECT *
         FROM personal_subscription_payments
         WHERE user_id = $1
           AND payment_provider =
             'paystack'
           AND provider_reference =
             $2
         LIMIT 1`,
    ownershipParams: [req.user.id, req.params.reference],
  });
