'use strict';

const PROVIDER_LABELS = Object.freeze({
  mtn: 'MTN',
  telecel: 'Telecel',
  at_money: 'AT',
});

function alertSeverityForComponent(
  alerts,
  component
) {
  const matching = (alerts || []).filter(
    (item) => item?.component === component
  );

  if (
    matching.some(
      (item) => item.severity === 'critical'
    )
  ) {
    return 'critical';
  }

  if (
    matching.some(
      (item) => item.severity === 'warning'
    )
  ) {
    return 'warning';
  }

  return null;
}

function statusFromSeverity(severity) {
  if (severity === 'critical') {
    return 'major_outage';
  }

  if (severity === 'warning') {
    return 'degraded';
  }

  return 'operational';
}

function providerStatuses(snapshot) {
  const health =
    snapshot?.provider_health?.providers || {};

  return Object.entries(PROVIDER_LABELS).map(
    ([key, label]) => {
      const provider = health[key] || {};

      return {
        key,
        label,
        status:
          provider.status || 'unknown',
        window_minutes:
          provider.window_minutes ?? null,
        terminal_transactions:
          provider.terminal_transactions ?? 0,
        success:
          provider.success ?? 0,
        failed:
          provider.failed ?? 0,
        pending_confirmation:
          provider.pending_confirmation ?? 0,
        failure_rate:
          provider.failure_rate ?? null,
      };
    }
  );
}

function buildOperatorStatus(snapshot) {
  const alerts =
    Array.isArray(snapshot?.operational_alerts)
      ? snapshot.operational_alerts
      : [];

  const apiSeverity =
    alertSeverityForComponent(
      alerts,
      'api'
    );

  const paystackSeverity =
    alertSeverityForComponent(
      alerts,
      'paystack'
    );

  const postgresSeverity =
    alertSeverityForComponent(
      alerts,
      'postgres'
    ) ||
    alertSeverityForComponent(
      alerts,
      'postgresql'
    );

  const redisSeverity =
    alertSeverityForComponent(
      alerts,
      'redis'
    );

  const outboxSeverity =
    alertSeverityForComponent(
      alerts,
      'outbox'
    );

  return {
    timestamp:
      snapshot?.timestamp ||
      new Date().toISOString(),

    platform: {
      api: {
        label: 'AgentPro API',
        status:
          snapshot?.api?.enabled === false
            ? 'unknown'
            : statusFromSeverity(
                apiSeverity
              ),
        telemetry_enabled:
          snapshot?.api?.enabled !== false,
      },

      paystack: {
        label: 'Paystack',
        status:
          snapshot
            ?.paystack_webhooks
            ?.enabled === true
            ? statusFromSeverity(
                paystackSeverity
              )
            : 'unknown',
        telemetry_enabled:
          snapshot
            ?.paystack_webhooks
            ?.enabled === true,
      },

      postgres: {
        label: 'PostgreSQL',
        status:
          statusFromSeverity(
            postgresSeverity
          ),
        waiting_requests:
          Number(
            snapshot
              ?.postgres
              ?.waiting_requests || 0
          ),
      },

      redis: {
        label: 'Redis',
        status:
          snapshot?.redis?.status === 'ready'
            ? statusFromSeverity(
                redisSeverity
              )
            : snapshot?.redis?.status
              ? 'degraded'
              : 'unknown',
      },

      outbox: {
        label: 'Transaction Outbox',
        status:
          statusFromSeverity(
            outboxSeverity
          ),
      },
    },

    providers:
      providerStatuses(snapshot),

    alerts: alerts.map((item) => ({
      code: item.code,
      severity: item.severity,
      component: item.component,
      message: item.message,
    })),
  };
}

module.exports = {
  PROVIDER_LABELS,
  alertSeverityForComponent,
  statusFromSeverity,
  providerStatuses,
  buildOperatorStatus,
};
