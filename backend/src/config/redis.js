const Redis = require("ioredis");
const { logger } = require("../utils/logger");

let redisClient;

function connectRedis() {
  return new Promise((resolve, reject) => {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected");
      resolve();
    });

    redisClient.on("error", (err) => {
      logger.error("Redis error:", err);
      if (!redisClient.status || redisClient.status === "close") {
        reject(err);
      }
    });

    redisClient.connect().catch(reject);
  });
}

/**
 * Set key with optional TTL (seconds). Fails silently if Redis is
 * unavailable, since caching is a non-critical optimization.
 */
async function setCache(key, value, ttlSeconds = null) {
  if (!redisClient) return null;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      return await redisClient.setex(`agentpro:${key}`, ttlSeconds, serialized);
    }
    return await redisClient.set(`agentpro:${key}`, serialized);
  } catch (e) {
    logger.warn("setCache failed (Redis unavailable):", e.message);
    return null;
  }
}

/**
 * Get cached value. Returns null (cache miss) if Redis is unavailable,
 * so callers naturally fall back to fetching fresh data.
 */
async function getCache(key) {
  if (!redisClient) return null;
  try {
    const value = await redisClient.get(`agentpro:${key}`);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    logger.warn("getCache failed (Redis unavailable):", e.message);
    return null;
  }
}

/**
 * Delete cached value
 */
async function deleteCache(key) {
  if (!redisClient) return null;
  try {
    return await redisClient.del(`agentpro:${key}`);
  } catch (e) {
    logger.warn("deleteCache failed (Redis unavailable):", e.message);
    return null;
  }
}

/**
 * Blacklist a JWT token (for logout / revocation). Fails silently
 * if Redis is unavailable - the client discards the token anyway,
 * so a failed blacklist just means it is not server-side revoked.
 */
async function blacklistToken(token, expiresIn) {
  if (!redisClient) return null;
  try {
    return await redisClient.setex(`blacklist:${token}`, expiresIn, "1");
  } catch (e) {
    logger.warn("blacklistToken failed (Redis unavailable):", e.message);
    return null;
  }
}

/**
 * Check if token is blacklisted. Returns false (not blacklisted,
 * i.e. allow the request) if Redis is unavailable, rather than
 * crashing every authenticated request when Redis is down.
 */
async function isTokenBlacklisted(token) {
  if (!redisClient) return false;
  try {
    return await redisClient.exists(`blacklist:${token}`);
  } catch (e) {
    logger.warn("isTokenBlacklisted failed (Redis unavailable), allowing request:", e.message);
    return false;
  }
}

/**
 * Store OTP or reset token
 */
async function storeOTP(key, value, ttlSeconds = 3600) {
  if (!redisClient) throw new Error("Redis unavailable - cannot store OTP");
  return redisClient.setex(`otp:${key}`, ttlSeconds, value);
}

async function getOTP(key) {
  if (!redisClient) return null;
  try {
    return await redisClient.get(`otp:${key}`);
  } catch (e) {
    logger.warn("getOTP failed (Redis unavailable):", e.message);
    return null;
  }
}

async function deleteOTP(key) {
  if (!redisClient) return null;
  try {
    return await redisClient.del(`otp:${key}`);
  } catch (e) {
    logger.warn("deleteOTP failed (Redis unavailable):", e.message);
    return null;
  }
}

module.exports = {
  get redisClient() { return redisClient; },
  connectRedis,
  setCache,
  getCache,
  deleteCache,
  blacklistToken,
  isTokenBlacklisted,
  storeOTP,
  getOTP,
  deleteOTP
};
