'use strict';

let sentry = null;
let initialized = false;
let enabled = false;

const SAFE_METADATA_KEYS = new Set([
  'requestId',
  'component',
  'operation',
  'errorCode',
  'eventType',
  'attempt',
  'service',
]);

function getSentry() {
  if (!sentry) {
    sentry = require('@sentry/node');
  }

  return sentry;
}

function parseSampleRate(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function sanitizeRouteLabel(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  let normalized = String(value).split('?')[0].split('#')[0].trim();

  normalized = normalized.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    ':id',
  );

  normalized = normalized.replace(/\/\d{4,}(?=\/|$)/g, '/:id');

  if (normalized.length > 300) {
    normalized = normalized.slice(0, 300);
  }

  return normalized || undefined;
}

function safeScalar(value) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value).slice(0, 200);
  }

  return undefined;
}

function sanitizeMetadata(input) {
  const output = {};

  if (!input || typeof input !== 'object') {
    return output;
  }

  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) {
      continue;
    }

    const safeValue =
      key === 'operation' ? sanitizeRouteLabel(value) : safeScalar(value);

    if (safeValue !== undefined) {
      output[key] = safeValue;
    }
  }

  return output;
}

function sanitizeTraceContext(trace) {
  if (!trace || typeof trace !== 'object') {
    return undefined;
  }

  const allowed = ['trace_id', 'span_id', 'parent_span_id', 'op', 'status'];

  const result = {};

  for (const key of allowed) {
    const value = safeScalar(trace[key]);

    if (value !== undefined) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeRuntimeContext(runtime) {
  if (!runtime || typeof runtime !== 'object') {
    return undefined;
  }

  const result = {};

  for (const key of ['name', 'version']) {
    const value = safeScalar(runtime[key]);

    if (value !== undefined) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeSentryEvent(event) {
  const sanitized = {
    ...event,
  };

  if (event.request && typeof event.request === 'object') {
    sanitized.request = {
      method: safeScalar(event.request.method),
      url: sanitizeRouteLabel(event.request.url),
    };
  }

  sanitized.user = undefined;
  sanitized.breadcrumbs = [];
  sanitized.extra = sanitizeMetadata(event.extra);
  sanitized.tags = sanitizeMetadata(event.tags);

  const contexts = {};

  const runtime = sanitizeRuntimeContext(event.contexts?.runtime);

  const trace = sanitizeTraceContext(event.contexts?.trace);

  if (runtime) {
    contexts.runtime = runtime;
  }

  if (trace) {
    contexts.trace = trace;
  }

  sanitized.contexts = contexts;

  if (sanitized.transaction) {
    sanitized.transaction = sanitizeRouteLabel(sanitized.transaction);
  }

  if (
    sanitized.exception?.values &&
    Array.isArray(sanitized.exception.values)
  ) {
    sanitized.exception = {
      ...sanitized.exception,
      values: sanitized.exception.values.map((entry) => ({
        type: safeScalar(entry?.type) || 'Error',
        value: 'Captured application error',
        stacktrace: entry?.stacktrace,
        mechanism: entry?.mechanism
          ? {
              type: safeScalar(entry.mechanism.type),
              handled: entry.mechanism.handled === true,
            }
          : undefined,
      })),
    };
  }

  if (sanitized.message) {
    sanitized.message = 'Captured application event';
  }

  sanitized.fingerprint = undefined;

  return sanitized;
}

function initializeObservability() {
  if (initialized) {
    return enabled;
  }

  initialized = true;

  const dsn = String(process.env.SENTRY_DSN || '').trim();

  if (!dsn) {
    enabled = false;
    return false;
  }

  try {
    getSentry().init({
      dsn,
      environment:
        process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'unknown',
      release: process.env.SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      includeLocalVariables: false,
      maxBreadcrumbs: 0,
      attachStacktrace: true,
      sampleRate: parseSampleRate(process.env.SENTRY_ERROR_SAMPLE_RATE, 1),
      tracesSampleRate: parseSampleRate(
        process.env.SENTRY_TRACES_SAMPLE_RATE,
        0,
      ),
      beforeSend: sanitizeSentryEvent,
      beforeSendTransaction: sanitizeSentryEvent,
    });

    enabled = true;
    return true;
  } catch (_) {
    enabled = false;

    process.stderr.write(
      '[observability] Sentry initialization failed; continuing with local logging.\n',
    );

    return false;
  }
}

function isObservabilityEnabled() {
  return enabled;
}

function captureException(error, metadata = {}) {
  if (!enabled) {
    return null;
  }

  try {
    const sdk = getSentry();

    return sdk.withScope((scope) => {
      scope.setLevel('error');

      const safe = sanitizeMetadata(metadata);

      for (const [key, value] of Object.entries(safe)) {
        scope.setTag(key, value);
      }

      return sdk.captureException(
        error instanceof Error
          ? error
          : new Error('Captured application error'),
      );
    });
  } catch (_) {
    return null;
  }
}

async function flushObservability(timeoutMs = 2000) {
  if (!enabled) {
    return true;
  }

  try {
    return await getSentry().flush(timeoutMs);
  } catch (_) {
    return false;
  }
}

module.exports = {
  captureException,
  flushObservability,
  initializeObservability,
  isObservabilityEnabled,
  parseSampleRate,
  sanitizeMetadata,
  sanitizeRouteLabel,
  sanitizeSentryEvent,
};
