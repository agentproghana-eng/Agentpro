'use strict';

const WINDOW_SECONDS = 60;
const LATENCY_SAMPLES_PER_SECOND = 512;

let started = false;
let lifetimeRequests = 0;
const buckets = new Map();

function emptyCounts() {
  return {
    requests: 0,
    status_2xx: 0,
    status_3xx: 0,
    status_4xx: 0,
    status_5xx: 0,
    aborted: 0,
  };
}

function secondKey(nowMs) {
  return Math.floor(nowMs / 1000);
}

function statusClass(statusCode) {
  const status = Number(statusCode);

  if (status >= 200 && status < 300) {
    return 'status_2xx';
  }

  if (status >= 300 && status < 400) {
    return 'status_3xx';
  }

  if (status >= 400 && status < 500) {
    return 'status_4xx';
  }

  if (status >= 500 && status < 600) {
    return 'status_5xx';
  }

  return null;
}

function cleanupBuckets(nowSecond) {
  const oldestAllowed =
    nowSecond - WINDOW_SECONDS + 1;

  for (const key of buckets.keys()) {
    if (key < oldestAllowed) {
      buckets.delete(key);
    }
  }
}

function createBucket() {
  return {
    ...emptyCounts(),
    latency_seen: 0,
    latency_samples: [],
    max_ms: null,
  };
}

function recordLatency(bucket, durationMs) {
  const duration = Number(durationMs);

  if (!Number.isFinite(duration) || duration < 0) {
    return;
  }

  const rounded = Number(duration.toFixed(3));

  bucket.latency_seen += 1;

  if (
    bucket.max_ms === null ||
    rounded > bucket.max_ms
  ) {
    bucket.max_ms = rounded;
  }

  if (
    bucket.latency_samples.length <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    bucket.latency_samples.push(rounded);
    return;
  }

  // Per-second reservoir sampling keeps memory bounded while
  // retaining an approximately representative latency sample.
  const replacementIndex = Math.floor(
    Math.random() * bucket.latency_seen
  );

  if (
    replacementIndex <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    bucket.latency_samples[replacementIndex] =
      rounded;
  }
}

function startApiRequestTelemetry() {
  started = true;
}

function stopApiRequestTelemetry() {
  started = false;
  lifetimeRequests = 0;
  buckets.clear();
}

function isApiRequestTelemetryStarted() {
  return started;
}

function recordApiRequest({
  statusCode,
  durationMs,
  aborted = false,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const nowSecond = secondKey(nowMs);
  cleanupBuckets(nowSecond);

  let bucket = buckets.get(nowSecond);

  if (!bucket) {
    bucket = createBucket();
    buckets.set(nowSecond, bucket);
  }

  bucket.requests += 1;
  lifetimeRequests += 1;

  if (aborted) {
    bucket.aborted += 1;
  } else {
    const key = statusClass(statusCode);

    if (key) {
      bucket[key] += 1;
    }
  }

  recordLatency(bucket, durationMs);
}

function percentile(sorted, percentileValue) {
  if (!sorted.length) {
    return null;
  }

  const rank = Math.ceil(
    percentileValue * sorted.length
  );

  return sorted[
    Math.max(0, rank - 1)
  ];
}

function apiRequestSnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond = secondKey(nowMs);
  cleanupBuckets(nowSecond);

  const counts = emptyCounts();
  const latencySamples = [];

  let maxMs = null;

  for (const bucket of buckets.values()) {
    counts.requests += bucket.requests;
    counts.status_2xx += bucket.status_2xx;
    counts.status_3xx += bucket.status_3xx;
    counts.status_4xx += bucket.status_4xx;
    counts.status_5xx += bucket.status_5xx;
    counts.aborted += bucket.aborted;

    latencySamples.push(
      ...bucket.latency_samples
    );

    if (
      bucket.max_ms !== null &&
      (
        maxMs === null ||
        bucket.max_ms > maxMs
      )
    ) {
      maxMs = bucket.max_ms;
    }
  }

  latencySamples.sort((a, b) => a - b);

  const serverErrorRate =
    counts.requests > 0
      ? Number(
          (
            counts.status_5xx /
            counts.requests
          ).toFixed(4)
        )
      : 0;

  return {
    enabled: started,
    window_seconds: WINDOW_SECONDS,
    requests_total: lifetimeRequests,
    requests_last_minute: counts.requests,
    requests_per_minute: counts.requests,

    responses: {
      status_2xx: counts.status_2xx,
      status_3xx: counts.status_3xx,
      status_4xx: counts.status_4xx,
      status_5xx: counts.status_5xx,
      aborted: counts.aborted,
    },

    server_error_rate: serverErrorRate,

    latency: {
      sample_count: latencySamples.length,
      p50_ms: percentile(
        latencySamples,
        0.50
      ),
      p95_ms: percentile(
        latencySamples,
        0.95
      ),
      p99_ms: percentile(
        latencySamples,
        0.99
      ),
      max_ms: maxMs,
    },
  };
}

module.exports = {
  WINDOW_SECONDS,
  LATENCY_SAMPLES_PER_SECOND,
  startApiRequestTelemetry,
  stopApiRequestTelemetry,
  isApiRequestTelemetryStarted,
  recordApiRequest,
  apiRequestSnapshot,
};
