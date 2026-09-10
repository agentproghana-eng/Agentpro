'use strict';

const SEVERITY = Object.freeze({
  WARNING: 'warning',
  CRITICAL: 'critical',
});

const API_MIN_REQUESTS = 100;
const API_WARNING_5XX_RATE = 0.05;
const API_CRITICAL_5XX_RATE = 0.15;

const API_MIN_LATENCY_SAMPLES = 100;
const API_WARNING_P95_MS = 1000;
const API_CRITICAL_P95_MS = 3000;

const PAYSTACK_MIN_FULFILLMENT_ATTEMPTS = 5;
const PAYSTACK_WARNING_FAILURE_RATE = 0.20;
const PAYSTACK_CRITICAL_FAILURE_RATE = 0.50;

const OUTBOX_WARNING_PENDING = 100;
const OUTBOX_CRITICAL_PENDING = 500;
const OUTBOX_WARNING_AGE_SECONDS = 300;
const OUTBOX_CRITICAL_AGE_SECONDS = 900;

const POSTGRES_WARNING_WAITING = 1;
const POSTGRES_CRITICAL_WAITING = 5;

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function alert({
  code,
  severity,
  component,
  message,
  observed,
  threshold,
  window = null,
}) {
  return {
    code,
    severity,
    component,
    message,
    observed,
    threshold,
    window,
  };
}

function evaluateProviderAlerts(
  providerHealth,
  alerts
) {
  const providers =
    providerHealth?.providers || {};

  for (
    const provider
    of ['mtn', 'telecel', 'at_money']
  ) {
    const health =
      providers[provider];

    if (!health) {
      continue;
    }

    if (
      health.status !== 'degraded' &&
      health.status !== 'major_outage'
    ) {
      continue;
    }

    const severity =
      health.status === 'major_outage'
        ? SEVERITY.CRITICAL
        : SEVERITY.WARNING;

    alerts.push(
      alert({
        code:
          `provider_${provider}_${health.status}`,
        severity,
        component: `provider:${provider}`,
        message:
          `${provider} transaction health is ${health.status.replace('_', ' ')}.`,
        observed: {
          terminal_transactions:
            finiteNumber(
              health.terminal_transactions
            ),
          failure_rate:
            health.failure_rate === null
              ? null
              : finiteNumber(
                  health.failure_rate
                ),
          failed:
            finiteNumber(
              health.failed
            ),
          success:
            finiteNumber(
              health.success
            ),
          pending_confirmation:
            finiteNumber(
              health.pending_confirmation
            ),
        },
        threshold: {
          minimum_terminal_transactions:
            finiteNumber(
              providerHealth
                ?.minimum_terminal_transactions,
              20
            ),
          degraded_failure_rate:
            0.10,
          major_outage_failure_rate:
            0.50,
        },
        window: {
          minutes:
            finiteNumber(
              health.window_minutes,
              finiteNumber(
                providerHealth
                  ?.window_minutes,
                10
              )
            ),
        },
      })
    );
  }
}

function evaluateApiAlerts(
  api,
  alerts
) {
  if (!api?.enabled) {
    return;
  }

  const requests =
    finiteNumber(
      api.requests_last_minute
    );

  const errorRate =
    finiteNumber(
      api.server_error_rate
    );

  if (
    requests >= API_MIN_REQUESTS &&
    errorRate >=
      API_WARNING_5XX_RATE
  ) {
    const critical =
      errorRate >=
      API_CRITICAL_5XX_RATE;

    alerts.push(
      alert({
        code: critical
          ? 'api_5xx_rate_critical'
          : 'api_5xx_rate_high',
        severity: critical
          ? SEVERITY.CRITICAL
          : SEVERITY.WARNING,
        component: 'api',
        message:
          'API server error rate is elevated.',
        observed: {
          requests,
          server_error_rate:
            errorRate,
          status_5xx:
            finiteNumber(
              api.responses
                ?.status_5xx
            ),
        },
        threshold: {
          minimum_requests:
            API_MIN_REQUESTS,
          warning_rate:
            API_WARNING_5XX_RATE,
          critical_rate:
            API_CRITICAL_5XX_RATE,
        },
        window: {
          seconds:
            finiteNumber(
              api.window_seconds,
              60
            ),
        },
      })
    );
  }

  const sampleCount =
    finiteNumber(
      api.latency?.sample_count
    );

  const p95 =
    api.latency?.p95_ms == null
      ? null
      : finiteNumber(
          api.latency.p95_ms
        );

  if (
    sampleCount >=
      API_MIN_LATENCY_SAMPLES &&
    p95 !== null &&
    p95 >=
      API_WARNING_P95_MS
  ) {
    const critical =
      p95 >=
      API_CRITICAL_P95_MS;

    alerts.push(
      alert({
        code: critical
          ? 'api_p95_latency_critical'
          : 'api_p95_latency_high',
        severity: critical
          ? SEVERITY.CRITICAL
          : SEVERITY.WARNING,
        component: 'api',
        message:
          'API p95 latency is elevated.',
        observed: {
          sample_count:
            sampleCount,
          p95_ms: p95,
        },
        threshold: {
          minimum_samples:
            API_MIN_LATENCY_SAMPLES,
          warning_p95_ms:
            API_WARNING_P95_MS,
          critical_p95_ms:
            API_CRITICAL_P95_MS,
        },
        window: {
          seconds:
            finiteNumber(
              api.window_seconds,
              60
            ),
        },
      })
    );
  }
}

function evaluatePaystackAlerts(
  paystack,
  alerts
) {
  if (!paystack?.enabled) {
    return;
  }

  const successes =
    finiteNumber(
      paystack.fulfillment_successes
    );

  const failures =
    finiteNumber(
      paystack.fulfillment_failures
    );

  const attempts =
    successes + failures;

  const failureRate =
    finiteNumber(
      paystack
        .fulfillment_failure_rate
    );

  if (
    attempts <
      PAYSTACK_MIN_FULFILLMENT_ATTEMPTS ||
    failureRate <
      PAYSTACK_WARNING_FAILURE_RATE
  ) {
    return;
  }

  const critical =
    failureRate >=
    PAYSTACK_CRITICAL_FAILURE_RATE;

  alerts.push(
    alert({
      code: critical
        ? 'paystack_fulfillment_critical'
        : 'paystack_fulfillment_degraded',
      severity: critical
        ? SEVERITY.CRITICAL
        : SEVERITY.WARNING,
      component: 'paystack',
      message:
        'Paystack webhook fulfillment failure rate is elevated.',
      observed: {
        fulfillment_attempts:
          attempts,
        fulfillment_failures:
          failures,
        fulfillment_failure_rate:
          failureRate,
      },
      threshold: {
        minimum_attempts:
          PAYSTACK_MIN_FULFILLMENT_ATTEMPTS,
        warning_rate:
          PAYSTACK_WARNING_FAILURE_RATE,
        critical_rate:
          PAYSTACK_CRITICAL_FAILURE_RATE,
      },
      window: {
        seconds:
          finiteNumber(
            paystack.window_seconds,
            60
          ),
      },
    })
  );
}

function evaluateRedisAlerts(
  redis,
  alerts
) {
  if (!redis) {
    return;
  }

  if (redis.status === 'ready') {
    return;
  }

  alerts.push(
    alert({
      code: 'redis_unavailable',
      severity:
        SEVERITY.CRITICAL,
      component: 'redis',
      message:
        'Redis is not ready.',
      observed: {
        status:
          String(
            redis.status ||
            'unknown'
          ),
      },
      threshold: {
        required_status:
          'ready',
      },
    })
  );
}

function evaluateOutboxAlerts(
  outbox,
  alerts
) {
  if (!outbox) {
    return;
  }

  const deadLetter =
    finiteNumber(
      outbox.dead_letter
    );

  if (deadLetter > 0) {
    alerts.push(
      alert({
        code:
          'outbox_dead_letter_present',
        severity:
          SEVERITY.CRITICAL,
        component: 'outbox',
        message:
          'Durable outbox contains dead-letter events.',
        observed: {
          dead_letter:
            deadLetter,
        },
        threshold: {
          maximum_dead_letter:
            0,
        },
      })
    );
  }

  const pending =
    finiteNumber(
      outbox.pending
    );

  if (
    pending >=
      OUTBOX_WARNING_PENDING
  ) {
    const critical =
      pending >=
      OUTBOX_CRITICAL_PENDING;

    alerts.push(
      alert({
        code: critical
          ? 'outbox_backlog_critical'
          : 'outbox_backlog_high',
        severity: critical
          ? SEVERITY.CRITICAL
          : SEVERITY.WARNING,
        component: 'outbox',
        message:
          'Durable outbox pending backlog is elevated.',
        observed: {
          pending,
        },
        threshold: {
          warning_pending:
            OUTBOX_WARNING_PENDING,
          critical_pending:
            OUTBOX_CRITICAL_PENDING,
        },
      })
    );
  }

  const oldestAge =
    finiteNumber(
      outbox
        .oldest_pending_age_seconds
    );

  if (
    oldestAge >=
      OUTBOX_WARNING_AGE_SECONDS
  ) {
    const critical =
      oldestAge >=
      OUTBOX_CRITICAL_AGE_SECONDS;

    alerts.push(
      alert({
        code: critical
          ? 'outbox_age_critical'
          : 'outbox_age_high',
        severity: critical
          ? SEVERITY.CRITICAL
          : SEVERITY.WARNING,
        component: 'outbox',
        message:
          'Oldest pending outbox event is delayed.',
        observed: {
          oldest_pending_age_seconds:
            oldestAge,
        },
        threshold: {
          warning_age_seconds:
            OUTBOX_WARNING_AGE_SECONDS,
          critical_age_seconds:
            OUTBOX_CRITICAL_AGE_SECONDS,
        },
      })
    );
  }
}

function evaluatePostgresAlerts(
  postgres,
  alerts
) {
  if (!postgres) {
    return;
  }

  const waiting =
    finiteNumber(
      postgres.waiting_requests
    );

  if (
    waiting <
      POSTGRES_WARNING_WAITING
  ) {
    return;
  }

  const critical =
    waiting >=
    POSTGRES_CRITICAL_WAITING;

  alerts.push(
    alert({
      code: critical
        ? 'postgres_pool_wait_critical'
        : 'postgres_pool_waiting',
      severity: critical
        ? SEVERITY.CRITICAL
        : SEVERITY.WARNING,
      component: 'postgres',
      message:
        'PostgreSQL pool has requests waiting for a connection.',
      observed: {
        waiting_requests:
          waiting,
        total_connections:
          finiteNumber(
            postgres
              .total_connections
          ),
        idle_connections:
          finiteNumber(
            postgres
              .idle_connections
          ),
      },
      threshold: {
        warning_waiting_requests:
          POSTGRES_WARNING_WAITING,
        critical_waiting_requests:
          POSTGRES_CRITICAL_WAITING,
      },
    })
  );
}

function evaluateOperationalAlerts(
  snapshot
) {
  const alerts = [];

  evaluateProviderAlerts(
    snapshot?.provider_health,
    alerts
  );

  evaluateApiAlerts(
    snapshot?.api,
    alerts
  );

  evaluatePaystackAlerts(
    snapshot?.paystack_webhooks,
    alerts
  );

  evaluateRedisAlerts(
    snapshot?.redis,
    alerts
  );

  evaluateOutboxAlerts(
    snapshot?.outbox,
    alerts
  );

  evaluatePostgresAlerts(
    snapshot?.postgres,
    alerts
  );

  alerts.sort((a, b) => {
    const weight = {
      critical: 0,
      warning: 1,
    };

    return (
      weight[a.severity] -
        weight[b.severity] ||
      a.code.localeCompare(b.code)
    );
  });

  const critical =
    alerts.filter(
      (item) =>
        item.severity ===
        SEVERITY.CRITICAL
    ).length;

  const warning =
    alerts.filter(
      (item) =>
        item.severity ===
        SEVERITY.WARNING
    ).length;

  return {
    status:
      critical > 0
        ? 'critical'
        : warning > 0
          ? 'warning'
          : 'operational',

    counts: {
      critical,
      warning,
      total:
        alerts.length,
    },

    alerts,
  };
}

module.exports = {
  SEVERITY,

  API_MIN_REQUESTS,
  API_WARNING_5XX_RATE,
  API_CRITICAL_5XX_RATE,
  API_MIN_LATENCY_SAMPLES,
  API_WARNING_P95_MS,
  API_CRITICAL_P95_MS,

  PAYSTACK_MIN_FULFILLMENT_ATTEMPTS,
  PAYSTACK_WARNING_FAILURE_RATE,
  PAYSTACK_CRITICAL_FAILURE_RATE,

  OUTBOX_WARNING_PENDING,
  OUTBOX_CRITICAL_PENDING,
  OUTBOX_WARNING_AGE_SECONDS,
  OUTBOX_CRITICAL_AGE_SECONDS,

  POSTGRES_WARNING_WAITING,
  POSTGRES_CRITICAL_WAITING,

  evaluateOperationalAlerts,
};
