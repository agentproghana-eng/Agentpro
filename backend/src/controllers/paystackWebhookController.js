const { logger } = require("../utils/logger");

const { verifyWebhookSignature } = require("../services/paystackService");

const {
  fulfillPaystackTransaction,
} = require("../services/paystackSubscriptionService");

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

  if (event?.event !== "charge.success") {
    return res.status(200).json({
      success: true,
      ignored: true,
    });
  }

  try {
    const result = await fulfillPaystackTransaction(event.data, {
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
