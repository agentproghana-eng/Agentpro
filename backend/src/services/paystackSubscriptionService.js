const { withTransaction } = require("../config/database");

const { auditLog } = require("./auditService");

const { sendToUser } = require("./notificationService");

const { logger } = require("../utils/logger");

const {
  activateBusinessSubscription,
  activatePersonalSubscription,
} = require("./subscriptionActivationService");

function providerTransactionId(data) {
  if (data?.id === undefined || data?.id === null) {
    return null;
  }

  return String(data.id);
}

function normalizeCurrency(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeReference(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function findPaymentForUpdate(client, reference) {
  const business = await client.query(
    `SELECT *
       FROM subscription_payments
       WHERE payment_provider = 'paystack'
         AND provider_reference = $1
       FOR UPDATE`,
    [reference],
  );

  if (business.rows.length > 0) {
    return {
      accountMode: "business",
      table: "subscription_payments",
      payment: business.rows[0],
    };
  }

  const personal = await client.query(
    `SELECT *
       FROM personal_subscription_payments
       WHERE payment_provider = 'paystack'
         AND provider_reference = $1
       FOR UPDATE`,
    [reference],
  );

  if (personal.rows.length > 0) {
    return {
      accountMode: "personal",
      table: "personal_subscription_payments",
      payment: personal.rows[0],
    };
  }

  return null;
}

async function updateProviderMetadata(client, table, paymentId, data) {
  const status = normalizeStatus(data?.status);

  const currency = normalizeCurrency(data?.currency);

  const channel = data?.channel ? String(data.channel) : null;

  await client.query(
    `UPDATE ${table}
     SET provider_transaction_id = $1,
         provider_status = $2,
         provider_channel = $3,
         provider_currency = $4
     WHERE id = $5`,
    [
      providerTransactionId(data),
      status || null,
      channel,
      currency || "GHS",
      paymentId,
    ],
  );
}

async function markProviderMismatchForReconciliation({
  client,
  located,
  data,
  reason,
}) {
  await client.query(
    `UPDATE ${located.table}
     SET status = 'rejected',
         provider_transaction_id = $1,
         provider_status = 'success',
         provider_channel = $2,
         provider_currency = $3,
         reconciliation_required = TRUE,
         reconciliation_reason = $4,
         verified_at = NOW(),
         rejection_reason =
           'The Paystack charge succeeded, but the amount or currency did not match the authoritative AgentPro charge. No subscription entitlement was granted.'
     WHERE id = $5`,
    [
      providerTransactionId(data),
      data?.channel ? String(data.channel) : null,
      normalizeCurrency(data?.currency) || null,
      reason,
      located.payment.id,
    ],
  );
}

async function markSupersededPaymentForReconciliation({ client, located }) {
  await client.query(
    `UPDATE ${located.table}
     SET status = 'rejected',
         provider_status = 'success',
         reconciliation_required = TRUE,
         reconciliation_reason =
           'Paystack charge succeeded, but this subscription cycle was already fulfilled. Refund or manual resolution is required.',
         verified_at = NOW(),
         rejection_reason =
           'No additional subscription entitlement was granted because this cycle was already fulfilled.'
     WHERE id = $1`,
    [located.payment.id],
  );
}

async function buildNotification(client, located, activation) {
  if (activation.outcome !== "activated") {
    return null;
  }

  if (located.accountMode === "business") {
    const owner = await client.query(
      `SELECT id
         FROM users
         WHERE company_id = $1
           AND role = 'business_owner'
         LIMIT 1`,
      [located.payment.company_id],
    );

    if (owner.rows.length === 0) {
      return null;
    }

    return {
      userId: owner.rows[0].id,
      payload: {
        type: "renewal_approved",
        title: "✅ Subscription Activated",
        body:
          `Your Paystack payment was verified. ` +
          `Your Business Plan is active until ` +
          `${activation.expiresAt.toLocaleDateString("en-GH")}.`,
        data: {
          expires_at: activation.expiresAt.toISOString(),
          payment_provider: "paystack",
        },
      },
    };
  }

  return {
    userId: located.payment.user_id,
    payload: {
      type: "personal_subscription_approved",
      title: "✅ Personal Subscription Activated",
      body:
        `Your Paystack payment was verified. ` +
        `Your Personal Plan is active until ` +
        `${activation.expiresAt.toLocaleDateString("en-GH")}.`,
      data: {
        expires_at: activation.expiresAt.toISOString(),
        payment_provider: "paystack",
      },
    },
  };
}

async function fulfillPaystackTransaction(
  data,
  { source = "webhook", actorUserId = null } = {},
) {
  const reference = normalizeReference(data?.reference);

  const providerStatus = normalizeStatus(data?.status);

  const currency = normalizeCurrency(data?.currency);

  const amountMinor = Number(data?.amount);

  if (!reference) {
    return {
      outcome: "invalid_reference",
    };
  }

  if (providerStatus !== "success") {
    return {
      outcome: "not_success",
      providerStatus,
    };
  }

  let result = null;
  let notification = null;

  await withTransaction(async (client) => {
    const located = await findPaymentForUpdate(client, reference);

    if (!located) {
      result = {
        outcome: "not_found",
        reference,
      };

      return;
    }

    const { payment } = located;

    if (
      payment.reconciliation_required === true &&
      normalizeStatus(payment.provider_status) === "success"
    ) {
      result = {
        outcome: "reconciliation_required",
        accountMode: located.accountMode,
        paymentId: payment.id,
        reference,
        reconciliationRequired: true,
      };

      return;
    }

    if (payment.status === "verified" || payment.fulfilled_at) {
      result = {
        outcome: "already_fulfilled",
        accountMode: located.accountMode,
        paymentId: payment.id,
        reference,
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
        "Paystack amount or currency did not match the authoritative AgentPro charge.";

      await markProviderMismatchForReconciliation({
        client,
        located,
        data,
        reason,
      });

      await auditLog({
        userId: actorUserId,
        companyId: payment.company_id || null,
        action: "PAYSTACK_SUBSCRIPTION_PAYMENT_RECONCILIATION_REQUIRED",
        entityType:
          located.accountMode === "business"
            ? "subscription_payment"
            : "personal_subscription_payment",
        entityId: payment.id,
        newValues: {
          source,
          reference,
          expected_amount_minor: expectedMinor,
          received_amount_minor: Number.isFinite(amountMinor)
            ? amountMinor
            : null,
          currency,
          provider_status: "success",
          reconciliation_required: true,
          reconciliation_reason: reason,
        },
        dbClient: client,
        strict: true,
      });

      result = {
        outcome: "reconciliation_required",
        verificationIssue: "amount_currency_mismatch",
        accountMode: located.accountMode,
        paymentId: payment.id,
        reference,
        reconciliationRequired: true,
      };

      return;
    }

    await updateProviderMetadata(client, located.table, payment.id, data);

    const activation =
      located.accountMode === "business"
        ? await activateBusinessSubscription({
            client,
            payment,
            verifiedBy: actorUserId,
            providerStatus: "success",
          })
        : await activatePersonalSubscription({
            client,
            payment,
            verifiedBy: actorUserId,
            providerStatus: "success",
          });

    if (activation.outcome === "superseded") {
      await markSupersededPaymentForReconciliation({
        client,
        located,
      });

      await auditLog({
        userId: actorUserId,
        companyId: payment.company_id || null,
        action: "PAYSTACK_SUBSCRIPTION_PAYMENT_RECONCILIATION_REQUIRED",
        entityType:
          located.accountMode === "business"
            ? "subscription_payment"
            : "personal_subscription_payment",
        entityId: payment.id,
        newValues: {
          source,
          reference,
          provider_status: "success",
          reconciliation_required: true,
          reconciliation_reason:
            "Paystack charge succeeded after this subscription cycle had already been fulfilled.",
        },
        dbClient: client,
        strict: true,
      });

      result = {
        outcome: "reconciliation_required",
        activationOutcome: "superseded",
        accountMode: located.accountMode,
        paymentId: payment.id,
        reference,
        reconciliationRequired: true,
      };

      return;
    }

    if (activation.outcome === "activated") {
      await auditLog({
        userId: actorUserId,
        companyId: payment.company_id || null,
        action:
          located.accountMode === "business"
            ? "PAYSTACK_SUBSCRIPTION_PAYMENT_VERIFIED"
            : "PAYSTACK_PERSONAL_SUBSCRIPTION_PAYMENT_VERIFIED",
        entityType:
          located.accountMode === "business"
            ? "subscription_payment"
            : "personal_subscription_payment",
        entityId: payment.id,
        newValues: {
          source,
          reference,
          amount_minor: amountMinor,
          currency,
          provider_transaction_id: providerTransactionId(data),
        },
        dbClient: client,
        strict: true,
      });

      notification = await buildNotification(client, located, activation);
    }

    result = {
      outcome: activation.outcome,
      accountMode: located.accountMode,
      paymentId: payment.id,
      reference,
      expiresAt: activation.expiresAt || null,
    };
  });

  if (notification) {
    try {
      await sendToUser(notification.userId, notification.payload);
    } catch (error) {
      logger.error("Paystack subscription notification error:", error);
    }
  }

  return result;
}

module.exports = {
  fulfillPaystackTransaction,
};
