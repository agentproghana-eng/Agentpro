const { logger } = require("../utils/logger");

const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";
const SENDER_ID = "AgentPro";

function formatGhanaPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}

async function sendSMS(to, message) {
  if (!process.env.ARKESEL_API_KEY) {
    logger.warn("ARKESEL_API_KEY not set, skipping SMS send");
    return { skipped: true };
  }
  try {
    const res = await fetch(ARKESEL_URL, {
      method: "POST",
      headers: {
        "api-key": process.env.ARKESEL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: SENDER_ID,
        message,
        recipients: [formatGhanaPhone(to)],
      }),
    });
    const data = await res.json();

    if (!res.ok || data.status !== "success") {
      logger.error("SMS provider rejected request", {
        httpStatus: res.status,
      });
      throw new Error("SMS provider rejected request");
    }

    logger.info(`SMS sent to ${to}: ${data.data?.id}`);
    return data;
  } catch (error) {
    if (error?.message === "SMS provider rejected request") {
      throw error;
    }

    logger.error("SMS send failed", {
      name: error?.name || "Error",
    });
    throw new Error("SMS send failed");
  }
}

async function sendRegistrationApprovedSMS(phone, firstName, companyName) {
  return sendSMS(phone,
    `Agent Pro Ghana: Hi ${firstName}, your ${companyName} account is now active! Your 30-day free trial has started. Log in to get started.`
  );
}

async function sendNewEmployeeSMS(
  phone,
  firstName,
  role,
  companyName
) {
  return sendSMS(
    phone,
    `Agent Pro Ghana: Hi ${firstName}, your ${role} account at ${companyName} is ready. Check your email for the secure password setup link. The link expires in 1 hour. If it does not arrive, use Forgot Password in the app.`
  );
}

async function sendSubscriptionRenewalSMS(phone, firstName, amount, expiryDate) {
  return sendSMS(phone,
    `Agent Pro Ghana: Payment of GHS ${amount} received. Your subscription is active until ${expiryDate}. Thank you!`
  );
}

async function sendAdPaymentConfirmedSMS(phone, firstName, adTitle) {
  return sendSMS(phone,
    `Agent Pro Ghana: Payment received for your Business Hub ad "${adTitle}". It is now live!`
  );
}

async function sendPasswordResetSMS(phone, firstName) {
  return sendSMS(phone,
    `Agent Pro Ghana: Hi ${firstName}, a password reset was requested for your account. Check your email for the reset link. If this was not you, ignore this message.`
  );
}

module.exports = {
  sendSMS,
  sendRegistrationApprovedSMS,
  sendNewEmployeeSMS,
  sendSubscriptionRenewalSMS,
  sendAdPaymentConfirmedSMS,
  sendPasswordResetSMS,
};
