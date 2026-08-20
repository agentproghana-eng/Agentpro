'use strict';

const crypto = require('crypto');
const redisConfig =
  require('../config/redis');

const CHALLENGE_TTL_SECONDS = 300;
const MAX_MFA_ATTEMPTS = 5;

function temporaryUnavailableError() {
  const error = new Error(
    'MFA challenge storage unavailable',
  );

  error.code =
    'MFA_TEMPORARILY_UNAVAILABLE';

  return error;
}

function getRedisClient() {
  const client =
    redisConfig.redisClient;

  if (!client) {
    throw temporaryUnavailableError();
  }

  return client;
}

function challengeDigest(token) {
  const normalized =
    String(token || '').trim();

  if (normalized.length < 32) {
    throw new Error(
      'Invalid MFA challenge token',
    );
  }

  return crypto
    .createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex');
}

function challengeKey(token) {
  return (
    'agentpro:mfa:challenge:' +
    challengeDigest(token)
  );
}

function attemptsKey(token) {
  return (
    'agentpro:mfa:attempts:' +
    challengeDigest(token)
  );
}

function parseChallenge(raw) {
  if (!raw) return null;

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return null;
  }

  if (
    parsed?.version !== 1 ||
    typeof parsed.userId !== 'string' ||
    !['enroll', 'verify'].includes(
      parsed.purpose,
    )
  ) {
    return null;
  }

  return parsed;
}

async function createMfaChallenge({
  userId,
  purpose,
  secret = null,
  deviceInfo = null,
  fcmToken = null,
}) {
  if (
    typeof userId !== 'string' ||
    !userId.trim()
  ) {
    throw new Error(
      'MFA challenge user is required',
    );
  }

  if (
    !['enroll', 'verify'].includes(
      purpose,
    )
  ) {
    throw new Error(
      'Invalid MFA challenge purpose',
    );
  }

  if (
    purpose === 'enroll' &&
    (
      typeof secret !== 'string' ||
      !secret.trim()
    )
  ) {
    throw new Error(
      'Enrollment challenge requires a secret',
    );
  }

  const token =
    crypto
      .randomBytes(32)
      .toString('base64url');

  const payload = {
    version: 1,
    userId,
    purpose,
    secret:
      purpose === 'enroll'
        ? secret
        : null,
    deviceInfo:
      deviceInfo ?? null,
    fcmToken:
      fcmToken ?? null,
    createdAt:
      new Date().toISOString(),
  };

  try {
    await getRedisClient().setex(
      challengeKey(token),
      CHALLENGE_TTL_SECONDS,
      JSON.stringify(payload),
    );
  } catch (error) {
    if (
      error?.code ===
      'MFA_TEMPORARILY_UNAVAILABLE'
    ) {
      throw error;
    }

    throw temporaryUnavailableError();
  }

  return token;
}

async function getMfaChallenge(token) {
  let raw;

  try {
    raw = await getRedisClient().get(
      challengeKey(token),
    );
  } catch (error) {
    if (
      error?.code ===
      'MFA_TEMPORARILY_UNAVAILABLE'
    ) {
      throw error;
    }

    throw temporaryUnavailableError();
  }

  return parseChallenge(raw);
}

async function recordMfaFailure(token) {
  const client =
    getRedisClient();

  try {
    const key =
      attemptsKey(token);

    const attempts =
      await client.incr(key);

    if (attempts === 1) {
      await client.expire(
        key,
        CHALLENGE_TTL_SECONDS,
      );
    }

    const locked =
      attempts >= MAX_MFA_ATTEMPTS;

    if (locked) {
      await client.del(
        challengeKey(token),
        key,
      );
    }

    return {
      attempts,
      locked,
      remaining:
        Math.max(
          0,
          MAX_MFA_ATTEMPTS -
            attempts,
        ),
    };
  } catch (error) {
    if (
      error?.code ===
      'MFA_TEMPORARILY_UNAVAILABLE'
    ) {
      throw error;
    }

    throw temporaryUnavailableError();
  }
}

async function consumeMfaChallenge(
  token,
) {
  const client =
    getRedisClient();

  const key =
    challengeKey(token);

  const attemptKey =
    attemptsKey(token);

  const script = `
    local value = redis.call('GET', KEYS[1])
    if value then
      redis.call('DEL', KEYS[1])
    end
    redis.call('DEL', KEYS[2])
    return value
  `;

  let raw;

  try {
    raw = await client.eval(
      script,
      2,
      key,
      attemptKey,
    );
  } catch (error) {
    throw temporaryUnavailableError();
  }

  return parseChallenge(raw);
}

module.exports = {
  CHALLENGE_TTL_SECONDS,
  MAX_MFA_ATTEMPTS,
  createMfaChallenge,
  getMfaChallenge,
  recordMfaFailure,
  consumeMfaChallenge,
};
