const crypto = require("crypto");

const PAYSTACK_API_BASE = "https://api.paystack.co";

const REQUEST_TIMEOUT_MS = 15_000;

function paystackSecretKey() {
  const key = String(process.env.PAYSTACK_SECRET_KEY || "").trim();

  if (!key) {
    const error = new Error("Paystack is not configured");

    error.code = "PAYSTACK_NOT_CONFIGURED";

    throw error;
  }

  return key;
}

function amountToMinorUnits(amount) {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Paystack amount must be positive");
  }

  const minor = Math.round(numeric * 100);

  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new Error("Paystack amount is outside the supported range");
  }

  return minor;
}

async function paystackRequest(path, { method = "GET", body } = {}) {
  const secret = paystackSecretKey();

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYSTACK_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json();

    if (!response.ok || payload?.status !== true) {
      const error = new Error(payload?.message || "Paystack request failed");

      error.code = "PAYSTACK_REQUEST_FAILED";

      error.httpStatus = response.status;

      throw error;
    }

    return payload.data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Paystack request timed out");

      timeoutError.code = "PAYSTACK_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function initializeTransaction({
  email,
  amountMinor,
  reference,
  metadata,
}) {
  const normalizedEmail = String(email || "").trim();

  const normalizedReference = String(reference || "").trim();

  if (!normalizedEmail) {
    throw new Error("Paystack customer email is required");
  }

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Paystack amount must be a positive integer");
  }

  if (!normalizedReference) {
    throw new Error("Paystack reference is required");
  }

  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: {
      email: normalizedEmail,
      amount: String(amountMinor),
      currency: "GHS",
      reference: normalizedReference,
      metadata: metadata || {},
    },
  });
}

async function verifyTransaction(reference) {
  const normalizedReference = String(reference || "").trim();

  if (!normalizedReference) {
    throw new Error("Paystack reference is required");
  }

  return paystackRequest(
    `/transaction/verify/${encodeURIComponent(normalizedReference)}`,
  );
}

function verifyWebhookSignature(rawBody, signature) {
  const suppliedSignature = String(signature || "")
    .trim()
    .toLowerCase();

  if (!/^[a-f0-9]{128}$/.test(suppliedSignature)) {
    return false;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody || ""), "utf8");

  const expectedHex = crypto
    .createHmac("sha512", paystackSecretKey())
    .update(bodyBuffer)
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");

  const supplied = Buffer.from(suppliedSignature, "hex");

  if (expected.length !== supplied.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, supplied);
}

module.exports = {
  PAYSTACK_API_BASE,
  amountToMinorUnits,
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
};
