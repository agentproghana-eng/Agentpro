"use strict";

const crypto = require("crypto");
const redisConfig = require("../config/redis");
const { sendSMS } = require("./smsService");

const {
  hashPersonalTrialIdentity,
} = require("./personalTrialEntitlementService");

const PHONE_VERIFICATION_VERSION = 1;

const PHONE_CHALLENGE_TTL_SECONDS = 300;

const PHONE_VERIFIED_TOKEN_TTL_SECONDS = 600;

const MAX_PHONE_VERIFICATION_ATTEMPTS = 5;

const PHONE_SEND_WINDOW_SECONDS = 15 * 60;

const MAX_PHONE_SENDS_PER_WINDOW = 3;

const PHONE_RESEND_COOLDOWN_SECONDS = 60;

class PersonalPhoneVerificationError extends Error {
  constructor(message, code, details = {}) {
    super(message);

    this.name = "PersonalPhoneVerificationError";

    this.code = code;

    Object.assign(this, details);
  }
}

function temporaryUnavailableError() {
  return new PersonalPhoneVerificationError(
    "Phone verification is temporarily unavailable.",
    "PHONE_VERIFICATION_TEMPORARILY_UNAVAILABLE",
  );
}

function deliveryUnavailableError() {
  return new PersonalPhoneVerificationError(
    "Verification code could not be delivered.",
    "PHONE_VERIFICATION_DELIVERY_UNAVAILABLE",
  );
}

function getRedisClient() {
  const client = redisConfig.redisClient;

  if (client == null) {
    throw temporaryUnavailableError();
  }

  return client;
}

function resolvePhoneVerificationPepper(explicitPepper) {
  const pepper = String(
    explicitPepper ?? process.env.PHONE_VERIFICATION_PEPPER ?? "",
  ).trim();

  if (pepper.length < 32) {
    throw new PersonalPhoneVerificationError(
      "Phone verification protection is not configured.",
      "PHONE_VERIFICATION_PROTECTION_UNAVAILABLE",
    );
  }

  return pepper;
}

function tokenDigest(token) {
  const normalized = String(token ?? "").trim();

  if (normalized.length < 32) {
    throw new PersonalPhoneVerificationError(
      "Verification token is invalid.",
      "PHONE_VERIFICATION_TOKEN_INVALID",
    );
  }

  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function challengeKey(token) {
  return "agentpro:personal-phone:" + "challenge:" + tokenDigest(token);
}

function challengeAttemptsKey(token) {
  return "agentpro:personal-phone:" + "attempts:" + tokenDigest(token);
}

function verifiedTokenKey(token) {
  return "agentpro:personal-phone:" + "verified:" + tokenDigest(token);
}

function phoneWindowKey(phoneClaim) {
  return (
    "agentpro:personal-phone:" +
    "send-window:" +
    phoneClaim.claimVersion +
    ":" +
    phoneClaim.claimHash
  );
}

function phoneCooldownKey(phoneClaim) {
  return (
    "agentpro:personal-phone:" +
    "send-cooldown:" +
    phoneClaim.claimVersion +
    ":" +
    phoneClaim.claimHash
  );
}

function optionalClaim(claimType, value) {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }

  return hashPersonalTrialIdentity({
    claimType,
    value,
  });
}

function buildBinding({ phone, installationId = null, simIccid = null }) {
  return {
    phoneClaim: hashPersonalTrialIdentity({
      claimType: "phone",
      value: phone,
    }),

    installationClaim: optionalClaim("installation", installationId),

    simClaim: optionalClaim("sim_iccid", simIccid),
  };
}

function sameClaim(left, right) {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  return (
    left.claimType === right.claimType &&
    left.claimHash === right.claimHash &&
    left.claimVersion === right.claimVersion
  );
}

function sameBinding(left, right) {
  return (
    sameClaim(left.phoneClaim, right.phoneClaim) &&
    sameClaim(left.installationClaim, right.installationClaim) &&
    sameClaim(left.simClaim, right.simClaim)
  );
}

function normalizeCode(code) {
  const normalized = String(code ?? "").trim();

  if (/^\d{6}$/.test(normalized) === false) {
    return null;
  }

  return normalized;
}

function codeDigest({ challengeToken, code, pepper }) {
  const normalizedCode = normalizeCode(code);

  if (normalizedCode == null) {
    throw new PersonalPhoneVerificationError(
      "Verification code is invalid.",
      "PHONE_VERIFICATION_INVALID_CODE",
    );
  }

  return crypto
    .createHmac("sha256", resolvePhoneVerificationPepper(pepper))
    .update(
      [
        "agentpro-personal-phone",
        String(PHONE_VERIFICATION_VERSION),
        tokenDigest(challengeToken),
        normalizedCode,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
}

function safeHexEqual(left, right) {
  const leftValue = String(left ?? "");

  const rightValue = String(right ?? "");

  if (/^[0-9a-f]{64}$/.test(leftValue) === false) {
    return false;
  }

  if (/^[0-9a-f]{64}$/.test(rightValue) === false) {
    return false;
  }

  const leftBuffer = Buffer.from(leftValue, "hex");

  const rightBuffer = Buffer.from(rightValue, "hex");

  if (leftBuffer.length === rightBuffer.length) {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  return false;
}

function parseChallenge(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed?.version !== PHONE_VERIFICATION_VERSION) {
      return null;
    }

    if (typeof parsed.codeHash !== "string") {
      return null;
    }

    if (parsed.phoneClaim == null) {
      return null;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

function parseVerifiedToken(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed?.version !== PHONE_VERIFICATION_VERSION) {
      return null;
    }

    if (typeof parsed.verifiedAt !== "string") {
      return null;
    }

    if (parsed.phoneClaim == null) {
      return null;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

async function enforcePhoneSendLimits(binding) {
  const client = getRedisClient();

  const script = `
    local cooldown =
      redis.call(
        'GET',
        KEYS[1]
      )

    if cooldown then
      return -1
    end

    local count =
      redis.call(
        'INCR',
        KEYS[2]
      )

    if count == 1 then
      redis.call(
        'EXPIRE',
        KEYS[2],
        ARGV[1]
      )
    end

    if count > tonumber(ARGV[2]) then
      return -2
    end

    redis.call(
      'SETEX',
      KEYS[1],
      ARGV[3],
      '1'
    )

    return count
  `;

  let result;

  try {
    result = await client.eval(
      script,
      2,
      phoneCooldownKey(binding.phoneClaim),
      phoneWindowKey(binding.phoneClaim),
      PHONE_SEND_WINDOW_SECONDS,
      MAX_PHONE_SENDS_PER_WINDOW,
      PHONE_RESEND_COOLDOWN_SECONDS,
    );
  } catch (_) {
    throw temporaryUnavailableError();
  }

  if (Number(result) === -1) {
    throw new PersonalPhoneVerificationError(
      "Please wait before requesting another verification code.",
      "PHONE_VERIFICATION_RESEND_TOO_SOON",
      {
        retryAfterSeconds: PHONE_RESEND_COOLDOWN_SECONDS,
      },
    );
  }

  if (Number(result) === -2) {
    throw new PersonalPhoneVerificationError(
      "Too many verification codes were requested for this phone.",
      "PHONE_VERIFICATION_RATE_LIMITED",
      {
        retryAfterSeconds: PHONE_SEND_WINDOW_SECONDS,
      },
    );
  }
}

async function cleanupFailedDelivery({ challengeToken, binding }) {
  try {
    await getRedisClient().del(
      challengeKey(challengeToken),
      phoneCooldownKey(binding.phoneClaim),
    );
  } catch (_) {
    return;
  }
}

async function beginPersonalPhoneVerification({
  phone,
  installationId = null,
  simIccid = null,
}) {
  const verificationPepper = resolvePhoneVerificationPepper();

  const binding = buildBinding({
    phone,
    installationId,
    simIccid,
  });

  await enforcePhoneSendLimits(binding);

  const challengeToken = crypto.randomBytes(32).toString("base64url");

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");

  const payload = {
    version: PHONE_VERIFICATION_VERSION,

    phoneClaim: binding.phoneClaim,

    installationClaim: binding.installationClaim,

    simClaim: binding.simClaim,

    codeHash: codeDigest({
      challengeToken,
      code,
      pepper: verificationPepper,
    }),

    createdAt: new Date().toISOString(),
  };

  try {
    await getRedisClient().setex(
      challengeKey(challengeToken),
      PHONE_CHALLENGE_TTL_SECONDS,
      JSON.stringify(payload),
    );
  } catch (_) {
    throw temporaryUnavailableError();
  }

  let delivery;

  try {
    delivery = await sendSMS(
      phone,
      [
        "AgentPro verification code:",
        code + ".",
        "It expires in 5 minutes.",
        "Do not share this code.",
      ].join(" "),
    );
  } catch (_) {
    await cleanupFailedDelivery({
      challengeToken,
      binding,
    });

    throw deliveryUnavailableError();
  }

  if (delivery?.skipped === true) {
    await cleanupFailedDelivery({
      challengeToken,
      binding,
    });

    throw deliveryUnavailableError();
  }

  return {
    challengeToken,

    expiresInSeconds: PHONE_CHALLENGE_TTL_SECONDS,
  };
}

async function getChallenge(challengeToken) {
  let raw;

  try {
    raw = await getRedisClient().get(challengeKey(challengeToken));
  } catch (_) {
    throw temporaryUnavailableError();
  }

  return {
    raw,

    parsed: parseChallenge(raw),
  };
}

async function recordVerificationFailure(challengeToken) {
  const client = getRedisClient();

  let attempts;

  try {
    attempts = await client.incr(challengeAttemptsKey(challengeToken));

    if (attempts === 1) {
      await client.expire(
        challengeAttemptsKey(challengeToken),
        PHONE_CHALLENGE_TTL_SECONDS,
      );
    }

    if (attempts >= MAX_PHONE_VERIFICATION_ATTEMPTS) {
      await client.del(
        challengeKey(challengeToken),
        challengeAttemptsKey(challengeToken),
      );
    }
  } catch (_) {
    throw temporaryUnavailableError();
  }

  return {
    attempts,

    remaining: Math.max(0, MAX_PHONE_VERIFICATION_ATTEMPTS - attempts),
  };
}

async function promoteChallenge({ challengeToken, rawChallenge, binding }) {
  const client = getRedisClient();

  const verifiedToken = crypto.randomBytes(32).toString("base64url");

  const verifiedAt = new Date().toISOString();

  const verifiedPayload = JSON.stringify({
    version: PHONE_VERIFICATION_VERSION,

    phoneClaim: binding.phoneClaim,

    installationClaim: binding.installationClaim,

    simClaim: binding.simClaim,

    verifiedAt,
  });

  const script = `
    local current =
      redis.call(
        'GET',
        KEYS[1]
      )

    if current == false then
      return 0
    end

    if current == ARGV[1] then
      redis.call(
        'DEL',
        KEYS[1],
        KEYS[2]
      )

      redis.call(
        'SETEX',
        KEYS[3],
        ARGV[2],
        ARGV[3]
      )

      return 1
    end

    return 0
  `;

  let promoted;

  try {
    promoted = await client.eval(
      script,
      3,
      challengeKey(challengeToken),
      challengeAttemptsKey(challengeToken),
      verifiedTokenKey(verifiedToken),
      rawChallenge,
      PHONE_VERIFIED_TOKEN_TTL_SECONDS,
      verifiedPayload,
    );
  } catch (_) {
    throw temporaryUnavailableError();
  }

  if (Number(promoted) === 1) {
    return {
      verifiedToken,
      verifiedAt,

      expiresInSeconds: PHONE_VERIFIED_TOKEN_TTL_SECONDS,
    };
  }

  throw new PersonalPhoneVerificationError(
    "Verification challenge has expired.",
    "PHONE_VERIFICATION_EXPIRED",
  );
}

async function verifyPersonalPhoneCode({
  challengeToken,
  code,
  phone,
  installationId = null,
  simIccid = null,
}) {
  const verificationPepper = resolvePhoneVerificationPepper();

  const current = await getChallenge(challengeToken);

  if (current.parsed == null) {
    throw new PersonalPhoneVerificationError(
      "Verification challenge has expired.",
      "PHONE_VERIFICATION_EXPIRED",
    );
  }

  const binding = buildBinding({
    phone,
    installationId,
    simIccid,
  });

  if (sameBinding(current.parsed, binding) === false) {
    const failure = await recordVerificationFailure(challengeToken);

    throw new PersonalPhoneVerificationError(
      "Verification details do not match the original request.",
      "PHONE_VERIFICATION_BINDING_MISMATCH",
      {
        remainingAttempts: failure.remaining,
      },
    );
  }

  const normalizedCode = normalizeCode(code);

  let suppliedHash = null;

  if (normalizedCode != null) {
    suppliedHash = codeDigest({
      challengeToken,

      code: normalizedCode,

      pepper: verificationPepper,
    });
  }

  if (suppliedHash == null) {
    const failure = await recordVerificationFailure(challengeToken);

    throw new PersonalPhoneVerificationError(
      "Verification code is invalid.",
      "PHONE_VERIFICATION_INVALID_CODE",
      {
        remainingAttempts: failure.remaining,
      },
    );
  }

  if (safeHexEqual(suppliedHash, current.parsed.codeHash) === false) {
    const failure = await recordVerificationFailure(challengeToken);

    throw new PersonalPhoneVerificationError(
      "Verification code is invalid.",
      "PHONE_VERIFICATION_INVALID_CODE",
      {
        remainingAttempts: failure.remaining,
      },
    );
  }

  return promoteChallenge({
    challengeToken,

    rawChallenge: current.raw,

    binding,
  });
}

async function consumePersonalPhoneVerification({
  verifiedToken,
  phone,
  installationId = null,
  simIccid = null,
}) {
  const client = getRedisClient();

  let raw;

  try {
    raw = await client.get(verifiedTokenKey(verifiedToken));
  } catch (_) {
    throw temporaryUnavailableError();
  }

  const parsed = parseVerifiedToken(raw);

  if (parsed == null) {
    throw new PersonalPhoneVerificationError(
      "Verified registration token is invalid or expired.",
      "PHONE_VERIFICATION_TOKEN_INVALID",
    );
  }

  const binding = buildBinding({
    phone,
    installationId,
    simIccid,
  });

  if (sameBinding(parsed, binding) === false) {
    throw new PersonalPhoneVerificationError(
      "Verified registration token does not match this phone or SIM.",
      "PHONE_VERIFICATION_BINDING_MISMATCH",
    );
  }

  const script = `
    local current =
      redis.call(
        'GET',
        KEYS[1]
      )

    if current == false then
      return false
    end

    if current == ARGV[1] then
      redis.call(
        'DEL',
        KEYS[1]
      )

      return current
    end

    return false
  `;

  let consumedRaw;

  try {
    consumedRaw = await client.eval(
      script,
      1,
      verifiedTokenKey(verifiedToken),
      raw,
    );
  } catch (_) {
    throw temporaryUnavailableError();
  }

  const consumed = parseVerifiedToken(consumedRaw);

  if (consumed == null) {
    throw new PersonalPhoneVerificationError(
      "Verified registration token is invalid or expired.",
      "PHONE_VERIFICATION_TOKEN_INVALID",
    );
  }

  return {
    verifiedAt: consumed.verifiedAt,
  };
}

module.exports = {
  PHONE_VERIFICATION_VERSION,
  PHONE_CHALLENGE_TTL_SECONDS,
  PHONE_VERIFIED_TOKEN_TTL_SECONDS,
  MAX_PHONE_VERIFICATION_ATTEMPTS,
  PHONE_SEND_WINDOW_SECONDS,
  MAX_PHONE_SENDS_PER_WINDOW,
  PHONE_RESEND_COOLDOWN_SECONDS,
  PersonalPhoneVerificationError,
  beginPersonalPhoneVerification,
  verifyPersonalPhoneCode,
  consumePersonalPhoneVerification,
};
