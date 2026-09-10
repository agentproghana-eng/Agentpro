'use strict';

const {
  withTransaction,
} = require('../config/database');

const INCIDENT_KEY_BY_CODE =
  Object.freeze({
    api_5xx_rate_high:
      'api:5xx_rate',
    api_5xx_rate_critical:
      'api:5xx_rate',

    api_p95_latency_high:
      'api:p95_latency',
    api_p95_latency_critical:
      'api:p95_latency',

    paystack_fulfillment_degraded:
      'paystack:fulfillment',
    paystack_fulfillment_critical:
      'paystack:fulfillment',

    redis_unavailable:
      'redis:availability',

    outbox_dead_letter_present:
      'outbox:dead_letter',

    outbox_backlog_high:
      'outbox:backlog',
    outbox_backlog_critical:
      'outbox:backlog',

    outbox_age_high:
      'outbox:oldest_pending_age',
    outbox_age_critical:
      'outbox:oldest_pending_age',

    postgres_pool_waiting:
      'postgres:pool_waiting',
    postgres_pool_wait_critical:
      'postgres:pool_waiting',
  });

const SAFE_SEVERITIES =
  new Set([
    'warning',
    'critical',
  ]);

const FORBIDDEN_KEY_PATTERN =
  /(^|_)(user|agent|email|phone|msisdn|token|password|pin|credential|secret|reference|amount|sim|iccid|ussd)($|_)/i;

function incidentKeyForAlert(alert) {
  const code =
    String(alert?.code || '');

  if (
    code.startsWith(
      'provider_mtn_'
    )
  ) {
    return 'provider:mtn';
  }

  if (
    code.startsWith(
      'provider_telecel_'
    )
  ) {
    return 'provider:telecel';
  }

  if (
    code.startsWith(
      'provider_at_money_'
    )
  ) {
    return 'provider:at_money';
  }

  return (
    INCIDENT_KEY_BY_CODE[code] ||
    null
  );
}

function hasForbiddenKey(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(
      hasForbiddenKey
    );
  }

  if (
    typeof value !== 'object'
  ) {
    return false;
  }

  for (
    const [key, child]
    of Object.entries(value)
  ) {
    if (
      FORBIDDEN_KEY_PATTERN.test(
        key
      )
    ) {
      return true;
    }

    if (hasForbiddenKey(child)) {
      return true;
    }
  }

  return false;
}

function safeObject(
  value,
  fieldName
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {};
  }

  if (
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    const error =
      new Error(
        `${fieldName} must be an object`
      );

    error.code =
      'OPERATIONAL_INCIDENT_INVALID_PAYLOAD';

    throw error;
  }

  if (hasForbiddenKey(value)) {
    const error =
      new Error(
        `${fieldName} contains forbidden identity data`
      );

    error.code =
      'OPERATIONAL_INCIDENT_SENSITIVE_PAYLOAD';

    throw error;
  }

  return value;
}

function normalizeAlert(alert) {
  const incidentKey =
    incidentKeyForAlert(alert);

  if (!incidentKey) {
    const error =
      new Error(
        'Operational alert code has no incident identity mapping'
      );

    error.code =
      'OPERATIONAL_INCIDENT_UNKNOWN_ALERT';

    throw error;
  }

  const code =
    String(alert?.code || '');

  const component =
    String(
      alert?.component || ''
    );

  const severity =
    String(
      alert?.severity || ''
    );

  if (
    !code ||
    !component ||
    !SAFE_SEVERITIES.has(
      severity
    )
  ) {
    const error =
      new Error(
        'Operational alert is invalid'
      );

    error.code =
      'OPERATIONAL_INCIDENT_INVALID_ALERT';

    throw error;
  }

  const observed =
    safeObject(
      alert.observed,
      'observed'
    );

  const threshold =
    safeObject(
      alert.threshold,
      'threshold'
    );

  let window = null;

  if (
    alert.window !== null &&
    alert.window !== undefined
  ) {
    window =
      safeObject(
        alert.window,
        'window'
      );
  }

  return {
    incidentKey,
    code,
    component,
    severity,
    observed,
    threshold,
    window,
  };
}

async function upsertActiveIncident({
  dbClient,
  alert,
  observedAt,
}) {
  const normalized =
    normalizeAlert(alert);

  const result =
    await dbClient.query(
      `INSERT INTO operational_incidents (
         incident_key,
         alert_code,
         component,
         severity,
         first_seen_at,
         last_seen_at,
         occurrence_count,
         latest_observed,
         latest_threshold,
         latest_window,
         resolved_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $5,
         1,
         $6::jsonb,
         $7::jsonb,
         $8::jsonb,
         NULL
       )
       ON CONFLICT (incident_key)
       WHERE resolved_at IS NULL
       DO UPDATE SET
         alert_code =
           EXCLUDED.alert_code,
         component =
           EXCLUDED.component,
         severity =
           EXCLUDED.severity,
         last_seen_at =
           EXCLUDED.last_seen_at,
         occurrence_count =
           operational_incidents.occurrence_count + 1,
         latest_observed =
           EXCLUDED.latest_observed,
         latest_threshold =
           EXCLUDED.latest_threshold,
         latest_window =
           EXCLUDED.latest_window
       RETURNING
         id,
         incident_key,
         alert_code,
         component,
         severity,
         first_seen_at,
         last_seen_at,
         occurrence_count,
         resolved_at`,
      [
        normalized.incidentKey,
        normalized.code,
        normalized.component,
        normalized.severity,
        observedAt,
        JSON.stringify(
          normalized.observed
        ),
        JSON.stringify(
          normalized.threshold
        ),
        normalized.window === null
          ? null
          : JSON.stringify(
              normalized.window
            ),
      ]
    );

  return result.rows[0];
}

async function resolveMissingIncidents({
  dbClient,
  activeIncidentKeys,
  observedAt,
}) {
  if (activeIncidentKeys.length === 0) {
    const result =
      await dbClient.query(
        `UPDATE operational_incidents
         SET resolved_at = $1
         WHERE resolved_at IS NULL
         RETURNING
           id,
           incident_key,
           resolved_at`,
        [observedAt]
      );

    return result.rows;
  }

  const result =
    await dbClient.query(
      `UPDATE operational_incidents
       SET resolved_at = $1
       WHERE
         resolved_at IS NULL
         AND NOT (
           incident_key =
           ANY($2::varchar[])
         )
       RETURNING
         id,
         incident_key,
         resolved_at`,
      [
        observedAt,
        activeIncidentKeys,
      ]
    );

  return result.rows;
}

async function reconcileOperationalIncidents(
  operationalAlerts,
  {
    observedAt = new Date(),
  } = {}
) {
  const alerts =
    operationalAlerts?.alerts;

  if (!Array.isArray(alerts)) {
    const error =
      new Error(
        'Operational alert evaluation is invalid'
      );

    error.code =
      'OPERATIONAL_INCIDENT_INVALID_EVALUATION';

    throw error;
  }

  const normalizedKeys =
    alerts.map(
      (alert) =>
        incidentKeyForAlert(alert)
    );

  if (
    normalizedKeys.some(
      (key) => !key
    )
  ) {
    const error =
      new Error(
        'Operational alert evaluation contains an unmapped alert'
      );

    error.code =
      'OPERATIONAL_INCIDENT_UNKNOWN_ALERT';

    throw error;
  }

  const uniqueKeys =
    new Set(normalizedKeys);

  if (
    uniqueKeys.size !==
    normalizedKeys.length
  ) {
    const error =
      new Error(
        'Operational alert evaluation contains duplicate incident identities'
      );

    error.code =
      'OPERATIONAL_INCIDENT_DUPLICATE_KEY';

    throw error;
  }

  const timestamp =
    observedAt instanceof Date
      ? observedAt
      : new Date(observedAt);

  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    const error =
      new Error(
        'observedAt is invalid'
      );

    error.code =
      'OPERATIONAL_INCIDENT_INVALID_TIME';

    throw error;
  }

  return withTransaction(
    async (client) => {
      const active = [];

      for (const alert of alerts) {
        active.push(
          await upsertActiveIncident({
            dbClient: client,
            alert,
            observedAt:
              timestamp,
          })
        );
      }

      const resolved =
        await resolveMissingIncidents({
          dbClient: client,
          activeIncidentKeys:
            [...uniqueKeys],
          observedAt:
            timestamp,
        });

      return {
        observed_at:
          timestamp.toISOString(),
        active,
        resolved,
      };
    }
  );
}

module.exports = {
  INCIDENT_KEY_BY_CODE,
  incidentKeyForAlert,
  normalizeAlert,
  reconcileOperationalIncidents,
};
