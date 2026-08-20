'use strict';

const redisConfig = require('../config/redis');

const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])

if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return {current, ttl}
`;

const DECREMENT_SCRIPT = `
local current = redis.call('GET', KEYS[1])

if not current then
  return 0
end

current = tonumber(current)

if current <= 1 then
  redis.call('DEL', KEYS[1])
  return 0
end

return redis.call('DECR', KEYS[1])
`;

function storeUnavailableError() {
  const error = new Error(
    'Shared security rate-limit store is unavailable'
  );

  error.code =
    'SECURITY_RATE_LIMIT_STORE_UNAVAILABLE';

  return error;
}

class RedisRateLimitStore {
  constructor({
    prefix = 'agentpro:rate-limit:',
  } = {}) {
    if (
      typeof prefix !== 'string' ||
      prefix.length === 0
    ) {
      throw new TypeError(
        'Rate-limit store prefix is required'
      );
    }

    this.prefix = prefix;
    this.windowMs = 60 * 1000;
    this.localKeys = false;
  }

  init(options) {
    const windowMs =
      Number(options?.windowMs);

    if (
      !Number.isFinite(windowMs) ||
      windowMs <= 0
    ) {
      throw new TypeError(
        'Rate-limit windowMs must be positive'
      );
    }

    this.windowMs = windowMs;
  }

  getClient() {
    const client =
      redisConfig.redisClient;

    if (!client) {
      throw storeUnavailableError();
    }

    return client;
  }

  getKey(key) {
    if (
      typeof key !== 'string' ||
      key.length === 0
    ) {
      throw new TypeError(
        'Rate-limit key is required'
      );
    }

    return `${this.prefix}${key}`;
  }

  async increment(key) {
    const client =
      this.getClient();

    const result =
      await client.eval(
        INCREMENT_SCRIPT,
        1,
        this.getKey(key),
        String(this.windowMs)
      );

    if (
      !Array.isArray(result) ||
      result.length !== 2
    ) {
      throw new Error(
        'Invalid Redis rate-limit response'
      );
    }

    const totalHits =
      Number(result[0]);

    const ttlMs =
      Number(result[1]);

    if (
      !Number.isInteger(totalHits) ||
      totalHits < 1 ||
      !Number.isFinite(ttlMs)
    ) {
      throw new Error(
        'Invalid Redis rate-limit counter state'
      );
    }

    return {
      totalHits,
      resetTime:
        new Date(
          Date.now() +
          Math.max(ttlMs, 1)
        ),
    };
  }

  async decrement(key) {
    const client =
      this.getClient();

    await client.eval(
      DECREMENT_SCRIPT,
      1,
      this.getKey(key)
    );
  }

  async resetKey(key) {
    const client =
      this.getClient();

    await client.del(
      this.getKey(key)
    );
  }
}

module.exports =
  RedisRateLimitStore;
