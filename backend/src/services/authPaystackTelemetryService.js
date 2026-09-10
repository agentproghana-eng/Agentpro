'use strict';

const WINDOW_SECONDS = 60;

let started = false;

const authBuckets = new Map();
const paystackBuckets = new Map();

function secondKey(nowMs) {
  return Math.floor(nowMs / 1000);
}

function cleanup(map, nowSecond) {
  const oldestAllowed =
    nowSecond - WINDOW_SECONDS + 1;

  for (const key of map.keys()) {
    if (key < oldestAllowed) {
      map.delete(key);
    }
  }
}

function emptyAuthCounts() {
  return {
    login_attempts: 0,
    successes: 0,
    invalid_credentials: 0,
    invalid_requests: 0,
    locked: 0,
    forbidden: 0,
    rate_limited: 0,
    unavailable: 0,
    server_failures: 0,
    other_responses: 0,
  };
}

function emptyPaystackCounts() {
  return {
    received: 0,
    valid_signatures: 0,
    invalid_signatures: 0,
    ignored_events: 0,
    charge_success_events: 0,
    fulfillment_successes: 0,
    fulfillment_failures: 0,
  };
}

function getBucket(map, nowSecond, factory) {
  cleanup(map, nowSecond);

  let bucket = map.get(nowSecond);

  if (!bucket) {
    bucket = factory();
    map.set(nowSecond, bucket);
  }

  return bucket;
}

function startAuthPaystackTelemetry() {
  started = true;
}

function stopAuthPaystackTelemetry() {
  started = false;
  authBuckets.clear();
  paystackBuckets.clear();
}

function isAuthPaystackTelemetryStarted() {
  return started;
}

function classifyLoginStatus(statusCode) {
  const status = Number(statusCode);

  if (status === 200 || status === 202) {
    return 'successes';
  }

  if (status === 400) {
    return 'invalid_requests';
  }

  if (status === 401) {
    return 'invalid_credentials';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 423) {
    return 'locked';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 503) {
    return 'unavailable';
  }

  if (status >= 500 && status < 600) {
    return 'server_failures';
  }

  return 'other_responses';
}

function recordLoginResponse({
  statusCode,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const nowSecond = secondKey(nowMs);

  const bucket = getBucket(
    authBuckets,
    nowSecond,
    emptyAuthCounts
  );

  bucket.login_attempts += 1;
  bucket[
    classifyLoginStatus(statusCode)
  ] += 1;
}

const PAYSTACK_EVENTS = new Set([
  'received',
  'valid_signatures',
  'invalid_signatures',
  'ignored_events',
  'charge_success_events',
  'fulfillment_successes',
  'fulfillment_failures',
]);

function recordPaystackWebhookEvent(
  event,
  {
    nowMs = Date.now(),
  } = {}
) {
  if (!started) {
    return;
  }

  if (!PAYSTACK_EVENTS.has(event)) {
    return;
  }

  const nowSecond = secondKey(nowMs);

  const bucket = getBucket(
    paystackBuckets,
    nowSecond,
    emptyPaystackCounts
  );

  bucket[event] += 1;
}

function aggregate(map, factory, nowSecond) {
  cleanup(map, nowSecond);

  const total = factory();

  for (const bucket of map.values()) {
    for (const key of Object.keys(total)) {
      total[key] += bucket[key];
    }
  }

  return total;
}

function authTelemetrySnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond = secondKey(nowMs);

  const counts = aggregate(
    authBuckets,
    emptyAuthCounts,
    nowSecond
  );

  const successRate =
    counts.login_attempts > 0
      ? Number(
          (
            counts.successes /
            counts.login_attempts
          ).toFixed(4)
        )
      : 0;

  return {
    enabled: started,
    window_seconds: WINDOW_SECONDS,
    ...counts,
    success_rate: successRate,
  };
}

function paystackWebhookTelemetrySnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond = secondKey(nowMs);

  const counts = aggregate(
    paystackBuckets,
    emptyPaystackCounts,
    nowSecond
  );

  const fulfillmentAttempts =
    counts.fulfillment_successes +
    counts.fulfillment_failures;

  const failureRate =
    fulfillmentAttempts > 0
      ? Number(
          (
            counts.fulfillment_failures /
            fulfillmentAttempts
          ).toFixed(4)
        )
      : 0;

  return {
    enabled: started,
    window_seconds: WINDOW_SECONDS,
    ...counts,
    fulfillment_failure_rate:
      failureRate,
  };
}

module.exports = {
  WINDOW_SECONDS,
  startAuthPaystackTelemetry,
  stopAuthPaystackTelemetry,
  isAuthPaystackTelemetryStarted,
  recordLoginResponse,
  recordPaystackWebhookEvent,
  authTelemetrySnapshot,
  paystackWebhookTelemetrySnapshot,
};
