const rateLimit =
  require('express-rate-limit');

const RedisRateLimitStore =
  require(
    '../services/redisRateLimitStore'
  );

const {
  rateLimitIdentityKey,
} = require(
  './rateLimitIdentity'
);

function sharedStore(prefix) {
  if (
    process.env.NODE_ENV === 'test'
  ) {
    return undefined;
  }

  return new RedisRateLimitStore({
    prefix,
  });
}

function createLimiter({
  windowMs,
  max,
  message,
  prefix,
  passOnStoreError,
}) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
    keyGenerator:
      rateLimitIdentityKey,
    passOnStoreError,
  };

  const store =
    sharedStore(prefix);

  if (store) {
    options.store = store;
  }

  return rateLimit(options);
}

exports.apiLimiter =
  createLimiter({
    windowMs:
      parseInt(
        process.env
          .RATE_LIMIT_WINDOW_MS,
        10
      ) ||
      60 * 1000,

    max:
      parseInt(
        process.env
          .RATE_LIMIT_MAX_REQUESTS,
        10
      ) ||
      100,

    message:
      'Too many requests. Please wait a moment and try again.',

    prefix:
      'agentpro:rate-limit:api:',

    passOnStoreError: true,
  });

exports.authLimiter =
  createLimiter({
    windowMs:
      15 * 60 * 1000,

    max: 10,

    message:
      'Too many authentication attempts. Please wait 15 minutes.',

    prefix:
      'agentpro:rate-limit:auth:',

    passOnStoreError: false,
  });

exports.personalPhoneVerificationSendLimiter =
  createLimiter({
    windowMs:
      15 * 60 * 1000,

    max: 8,

    message:
      'Too many verification-code requests. Please wait and try again.',

    prefix:
      'agentpro:rate-limit:phone-verification-send:',

    passOnStoreError: false,
  });

exports.personalPhoneVerificationVerifyLimiter =
  createLimiter({
    windowMs:
      15 * 60 * 1000,

    max: 30,

    message:
      'Too many verification attempts. Please wait and try again.',

    prefix:
      'agentpro:rate-limit:phone-verification-verify:',

    passOnStoreError: false,
  });

exports.refreshLimiter =
  createLimiter({
    windowMs:
      15 * 60 * 1000,

    max: 120,

    message:
      'Too many session refresh attempts. Please wait and try again.',

    prefix:
      'agentpro:rate-limit:refresh:',

    passOnStoreError: false,
  });

exports.aiLimiter =
  createLimiter({
    windowMs:
      60 * 1000,

    max: 30,

    message:
      'Too many AI requests. Please wait a moment.',

    prefix:
      'agentpro:rate-limit:ai:',

    passOnStoreError: false,
  });
