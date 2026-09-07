const { logger } = require("../utils/logger");

const { verifyWebhookSignature } = require("../services/paystackService");

const {
  fulfillPaystackTransaction,
} = require("../services/paystackSubscriptionService");

const {
  fulfillBusinessHubPaystackTransaction,
} = require("../services/businessHubPaystackPaymentService");

exports.handleWebhook = async (req, res) => {
  const signature = req.get("x-paystack-signature");

  const rawBody = req.rawBody;

  if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({
      success: false,
      message: "Invalid Paystack signature",
    });
  }

  const event = req.body;

  logger.info("Paystack webhook received", {
    event: event?.event || null,
    reference: event?.data?.reference ? String(event.data.reference) : null,
  });

  if (event?.event !== "charge.success") {
    return res.status(200).json({
      success: true,
      ignored: true,
    });
  }

  try {
    const reference = String(event?.data?.reference || "").trim();

    const paymentKind = String(event?.data?.metadata?.payment_kind || "")
      .trim()
      .toLowerCase();

    const isBusinessHubPayment =
      paymentKind === "business_hub" || reference.startsWith("APG-BHUB-");

    const result = isBusinessHubPayment
      ? await fulfillBusinessHubPaystackTransaction(event.data, {
          source: "webhook",
          actorUserId: null,
        })
      : await fulfillPaystackTransaction(event.data, {
          source: "webhook",
          actorUserId: null,
        });

    return res.status(200).json({
      success: true,
      outcome: result.outcome,
    });
  } catch (error) {
    logger.error("Paystack webhook processing error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};
