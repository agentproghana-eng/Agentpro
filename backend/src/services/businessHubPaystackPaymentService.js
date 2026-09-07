const { withTransaction } = require("../config/database");
const { auditLog } = require("./auditService");
const { enqueueOutboxEvent } = require("./outboxService");

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeCurrency(value) {
  return normalizeText(value).toUpperCase();
}

function providerTransactionId(data) {
  if (data?.id === undefined || data?.id === null) {
    return null;
  }

  return String(data.id);
}

function moneyMinorUnits(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const minor = Math.round(amount * 100);

  return Number.isSafeInteger(minor) ? minor : null;
}

async function markReconciliationRequired({ client, payment, data, reason }) {
  await client.query(
    `UPDATE ad_payments
     SET status = 'rejected',
         provider_transaction_id = $1,
         provider_status = 'success',
         provider_channel = $2,
         provider_currency = $3,
         reconciliation_required = TRUE,
         reconciliation_reason = $4,
         verified_at = NOW(),
         rejection_reason = $5
     WHERE id = $6`,
    [
      providerTransactionId(data),
      data?.channel ? String(data.channel) : null,
      normalizeCurrency(data?.currency) || null,
      reason,
      "The Paystack charge succeeded, but AgentPro could not safely publish the Business Hub listing. Manual reconciliation is required.",
      payment.id,
    ],
  );
}

async function fulfillBusinessHubPaystackTransaction(
  data,
  { source = "webhook", actorUserId = null } = {},
) {
  const reference = normalizeText(data?.reference);
  const providerStatus = normalizeStatus(data?.status);
  const currency = normalizeCurrency(data?.currency);
  const amountMinor = Number(data?.amount);

  if (!reference) {
    return { outcome: "invalid_reference" };
  }

  if (providerStatus !== "success") {
    return {
      outcome: "not_success",
      providerStatus,
    };
  }

  let result = null;

  await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT *
       FROM ad_payments
       WHERE payment_provider = 'paystack'
         AND provider_reference = $1
       FOR UPDATE`,
      [reference],
    );

    if (!paymentResult.rows.length) {
      result = {
        outcome: "not_found",
        reference,
      };
      return;
    }

    const payment = paymentResult.rows[0];

    if (
      payment.reconciliation_required === true &&
      normalizeStatus(payment.provider_status) === "success"
    ) {
      result = {
        outcome: "reconciliation_required",
        paymentId: payment.id,
        reference,
      };
      return;
    }

    if (payment.status === "verified" || payment.fulfilled_at) {
      result = {
        outcome: "already_fulfilled",
        paymentId: payment.id,
        adId: payment.advertisement_id,
        reference,
      };
      return;
    }

    if (payment.status !== "pending") {
      result = {
        outcome: "payment_not_pending",
        paymentId: payment.id,
        adId: payment.advertisement_id,
        reference,
        paymentStatus: payment.status,
      };
      return;
    }

    const expectedMinor = Number(payment.expected_amount_minor);

    if (
      !Number.isSafeInteger(amountMinor) ||
      !Number.isSafeInteger(expectedMinor) ||
      amountMinor !== expectedMinor ||
      currency !== "GHS"
    ) {
      const reason =
        "Paystack amount or currency did not match the authoritative Business Hub charge.";

      await markReconciliationRequired({
        client,
        payment,
        data,
        reason,
      });

      await auditLog({
        userId: actorUserId,
        companyId: null,
        action: "BUSINESS_HUB_PAYSTACK_RECONCILIATION_REQUIRED",
        entityType: "advertisement",
        entityId: payment.advertisement_id,
        newValues: {
          source,
          reference,
          expected_amount_minor: expectedMinor,
          received_amount_minor: Number.isFinite(amountMinor)
            ? amountMinor
            : null,
          currency,
          reason,
        },
        dbClient: client,
        strict: true,
      });

      result = {
        outcome: "reconciliation_required",
        verificationIssue: "amount_currency_mismatch",
        paymentId: payment.id,
        adId: payment.advertisement_id,
        reference,
      };
      return;
    }

    const adResult = await client.query(
      `SELECT
         id,
         posted_by,
         company_id,
         title,
         status,
         amount_due
       FROM advertisements
       WHERE id = $1
       FOR UPDATE`,
      [payment.advertisement_id],
    );

    if (!adResult.rows.length) {
      const reason = "Business Hub listing no longer exists.";

      await markReconciliationRequired({
        client,
        payment,
        data,
        reason,
      });

      result = {
        outcome: "reconciliation_required",
        verificationIssue: "listing_missing",
        paymentId: payment.id,
        reference,
      };
      return;
    }

    const ad = adResult.rows[0];
    const approvedMinor = moneyMinorUnits(ad.amount_due);

    if (
      ad.status !== "pending_payment" ||
      approvedMinor === null ||
      approvedMinor !== expectedMinor
    ) {
      const reason =
        ad.status !== "pending_payment"
          ? `Business Hub listing is ${ad.status}, not pending_payment.`
          : "Administrator-approved amount changed after checkout initialization.";

      await markReconciliationRequired({
        client,
        payment,
        data,
        reason,
      });

      await auditLog({
        userId: actorUserId,
        companyId: ad.company_id || null,
        action: "BUSINESS_HUB_PAYSTACK_RECONCILIATION_REQUIRED",
        entityType: "advertisement",
        entityId: ad.id,
        newValues: {
          source,
          reference,
          reason,
          listing_status: ad.status,
          approved_amount_minor: approvedMinor,
          expected_amount_minor: expectedMinor,
        },
        dbClient: client,
        strict: true,
      });

      result = {
        outcome: "reconciliation_required",
        verificationIssue: "listing_state_or_amount_changed",
        paymentId: payment.id,
        adId: ad.id,
        reference,
      };
      return;
    }

    const [durationConfig, graceConfig] = await Promise.all([
      client.query(
        `SELECT value
         FROM system_config
         WHERE key = 'ad_duration_days'`,
      ),
      client.query(
        `SELECT value
         FROM system_config
         WHERE key = 'ad_grace_period_days'`,
      ),
    ]);

    const days = parseInt(durationConfig.rows[0]?.value, 10) || 30;
    const graceDays = parseInt(graceConfig.rows[0]?.value, 10) || 7;
    const expiresAt = new Date(Date.now() + days * 86400000);
    const graceEnds = new Date(expiresAt.getTime() + graceDays * 86400000);

    const verifiedPayment = await client.query(
      `UPDATE ad_payments
       SET status = 'verified',
           provider_transaction_id = $1,
           provider_status = 'success',
           provider_channel = $2,
           provider_currency = $3,
           verified_by = $4,
           verified_at = NOW(),
           fulfilled_at = NOW(),
           rejection_reason = NULL
       WHERE id = $5
         AND status = 'pending'
       RETURNING id`,
      [
        providerTransactionId(data),
        data?.channel ? String(data.channel) : null,
        currency,
        actorUserId,
        payment.id,
      ],
    );

    if (!verifiedPayment.rows.length) {
      result = {
        outcome: "already_fulfilled",
        paymentId: payment.id,
        adId: ad.id,
        reference,
      };
      return;
    }

    const activated = await client.query(
      `UPDATE advertisements
       SET status = 'active',
           published_at = NOW(),
           expires_at = $1,
           grace_period_ends_at = $2,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $3
         AND status = 'pending_payment'
       RETURNING *`,
      [expiresAt, graceEnds, ad.id],
    );

    if (!activated.rows.length) {
      throw new Error(
        "Business Hub listing state changed while Paystack fulfillment was running",
      );
    }

    const activeAd = activated.rows[0];

    await auditLog({
      userId: actorUserId,
      companyId: activeAd.company_id || null,
      action: "BUSINESS_HUB_PAYSTACK_PAYMENT_VERIFIED_AND_PUBLISHED",
      entityType: "advertisement",
      entityId: activeAd.id,
      oldValues: {
        status: "pending_payment",
        payment_status: "pending",
      },
      newValues: {
        status: "active",
        payment_status: "verified",
        payment_provider: "paystack",
        reference,
        provider_transaction_id: providerTransactionId(data),
        amount_minor: amountMinor,
        currency,
        source,
      },
      dbClient: client,
      strict: true,
    });

    const payload = {
      user_id: activeAd.posted_by,
      ad_id: activeAd.id,
      ad_title: activeAd.title,
      amount: (expectedMinor / 100).toFixed(2),
    };

    const events = [
      {
        eventType: "notification.business_hub.payment_confirmed",
        channel: "app",
      },
      {
        eventType: "sms.business_hub.payment_confirmed",
        channel: "sms",
      },
      {
        eventType: "email.business_hub.payment_confirmed",
        channel: "email",
      },
    ];

    for (const event of events) {
      await enqueueOutboxEvent({
        dbClient: client,
        eventType: event.eventType,
        aggregateType: "advertisement",
        aggregateId: activeAd.id,
        dedupeKey: `business-hub:payment-confirmed:${event.channel}:${activeAd.id}:${payment.id}`,
        payload,
      });
    }

    result = {
      outcome: "activated",
      paymentId: payment.id,
      adId: activeAd.id,
      reference,
      expiresAt,
    };
  });

  return result;
}

module.exports = {
  fulfillBusinessHubPaystackTransaction,
};
