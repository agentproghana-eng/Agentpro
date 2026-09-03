const crypto = require('crypto');

const WEB_ID_HEADER =
  'x-agentpro-web-rate-limit-id';

const WEB_SIGNATURE_HEADER =
  'x-agentpro-web-rate-limit-signature';

const SIGNING_CONTEXT =
  'agentpro-web-rate-limit:v1:';

const HEX_SHA256_PATTERN =
  /^[a-f0-9]{64}$/;

function configuredSecret() {
  return String(
    process.env
      .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET ||
      ''
  ).trim();
}

function safeHexEqual(
  actual,
  expected
) {
  if (
    !HEX_SHA256_PATTERN.test(actual) ||
    !HEX_SHA256_PATTERN.test(expected)
  ) {
    return false;
  }

  const actualBuffer =
    Buffer.from(actual, 'hex');

  const expectedBuffer =
    Buffer.from(expected, 'hex');

  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    actualBuffer,
    expectedBuffer
  );
}

function verifiedWebRateLimitIdentity(
  req
) {
  const secret = configuredSecret();

  // A missing or obviously weak shared secret must never
  // make a caller-controlled identity authoritative.
  if (secret.length < 32) {
    return null;
  }

  const identityValue = String(
    req.get(WEB_ID_HEADER) || ''
  )
    .trim()
    .toLowerCase();

  const suppliedSignature = String(
    req.get(WEB_SIGNATURE_HEADER) || ''
  )
    .trim()
    .toLowerCase();

  if (
    !HEX_SHA256_PATTERN.test(
      identityValue
    ) ||
    !HEX_SHA256_PATTERN.test(
      suppliedSignature
    )
  ) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      `${SIGNING_CONTEXT}${identityValue}`
    )
    .digest('hex');

  if (
    !safeHexEqual(
      suppliedSignature,
      expectedSignature
    )
  ) {
    return null;
  }

  return identityValue;
}

function rateLimitIdentityKey(req) {
  const webIdentity =
    verifiedWebRateLimitIdentity(req);

  if (webIdentity) {
    return `web:${webIdentity}`;
  }

  // Direct mobile/API clients retain the existing IP-based
  // behavior. Never trust an unsigned browser-supplied key.
  return String(
    req.ip ||
      req.socket?.remoteAddress ||
      'unknown'
  );
}

module.exports = {
  rateLimitIdentityKey,
  verifiedWebRateLimitIdentity,
};
