'use strict';

const WINDOW_SECONDS = 60;
const LATENCY_SAMPLES_PER_SECOND = 512;

let started = false;
const buckets = new Map();

function secondKey(nowMs) {
  return Math.floor(nowMs / 1000);
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

function createMetricBucket() {
  return {
    seen: 0,
    samples: [],
    max_ms: null,
  };
}

function createBucket() {
  return {
    operations: 0,
    failures: 0,
    acquisition: createMetricBucket(),
    execution: createMetricBucket(),
    total: createMetricBucket(),
  };
}

function recordLatency(metric, durationMs) {
  if (
    durationMs === null ||
    durationMs === undefined
  ) {
    return;
  }

  const duration = Number(durationMs);

  if (!Number.isFinite(duration) || duration < 0) {
    return;
  }

  const rounded =
    Number(duration.toFixed(3));

  metric.seen += 1;

  if (
    metric.max_ms === null ||
    rounded > metric.max_ms
  ) {
    metric.max_ms = rounded;
  }

  if (
    metric.samples.length <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    metric.samples.push(rounded);
    return;
  }

  const replacementIndex =
    Math.floor(
      Math.random() * metric.seen
    );

  if (
    replacementIndex <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    metric.samples[replacementIndex] =
      rounded;
  }
}

function startDatabaseTelemetry() {
  started = true;
}

function stopDatabaseTelemetry() {
  started = false;
  buckets.clear();
}

function isDatabaseTelemetryStarted() {
  return started;
}

function recordDatabaseOperation({
  acquisitionMs,
  executionMs,
  totalMs,
  success = true,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const nowSecond =
    secondKey(nowMs);

  cleanupBuckets(nowSecond);

  let bucket =
    buckets.get(nowSecond);

  if (!bucket) {
    bucket = createBucket();
    buckets.set(nowSecond, bucket);
  }

  bucket.operations += 1;

  if (!success) {
    bucket.failures += 1;
  }

  recordLatency(
    bucket.acquisition,
    acquisitionMs
  );

  recordLatency(
    bucket.execution,
    executionMs
  );

  recordLatency(
    bucket.total,
    totalMs
  );
}

function percentile(
  sorted,
  percentileValue
) {
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

function aggregateMetric(metricName) {
  const samples = [];
  let maxMs = null;

  for (const bucket of buckets.values()) {
    const metric = bucket[metricName];

    samples.push(...metric.samples);

    if (
      metric.max_ms !== null &&
      (
        maxMs === null ||
        metric.max_ms > maxMs
      )
    ) {
      maxMs = metric.max_ms;
    }
  }

  samples.sort((a, b) => a - b);

  return {
    sample_count: samples.length,
    p50_ms: percentile(
      samples,
      0.50
    ),
    p95_ms: percentile(
      samples,
      0.95
    ),
    p99_ms: percentile(
      samples,
      0.99
    ),
    max_ms: maxMs,
  };
}

function databaseTelemetrySnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond =
    secondKey(nowMs);

  cleanupBuckets(nowSecond);

  let operations = 0;
  let failures = 0;

  for (const bucket of buckets.values()) {
    operations += bucket.operations;
    failures += bucket.failures;
  }

  return {
    enabled: started,
    window_seconds: WINDOW_SECONDS,
    operations,
    failures,
    acquisition_wait:
      aggregateMetric('acquisition'),
    execution:
      aggregateMetric('execution'),
    total:
      aggregateMetric('total'),
  };
}

module.exports = {
  WINDOW_SECONDS,
  LATENCY_SAMPLES_PER_SECOND,
  startDatabaseTelemetry,
  stopDatabaseTelemetry,
  isDatabaseTelemetryStarted,
  recordDatabaseOperation,
  databaseTelemetrySnapshot,
};
