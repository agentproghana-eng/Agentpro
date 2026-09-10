'use strict';

const WARNING_REMINDER_MS =
  2 * 60 * 60 * 1000;

const CRITICAL_REMINDER_MS =
  30 * 60 * 1000;

const VALID_SEVERITIES =
  new Set([
    'warning',
    'critical',
  ]);

const VALID_NOTIFICATION_KINDS =
  new Set([
    'opened',
    'escalated',
    'reminder',
    'recovered',
  ]);

function policyError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code = code;

  return error;
}

function validDateOrNull(
  value,
  fieldName
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_STATE',
      `${fieldName} is invalid`
    );
  }

  return date;
}

function normalizeIncident(
  incident
) {
  if (
    !incident ||
    typeof incident !== 'object' ||
    Array.isArray(incident)
  ) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_INCIDENT',
      'Operational incident is invalid'
    );
  }

  const id =
    Number(incident.id);

  const severity =
    String(
      incident.severity || ''
    );

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !VALID_SEVERITIES.has(
      severity
    )
  ) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_INCIDENT',
      'Operational incident identity or severity is invalid'
    );
  }

  return {
    id,
    incidentKey:
      String(
        incident.incident_key ||
        ''
      ),
    alertCode:
      String(
        incident.alert_code ||
        ''
      ),
    component:
      String(
        incident.component ||
        ''
      ),
    severity,
    firstSeenAt:
      validDateOrNull(
        incident.first_seen_at,
        'first_seen_at'
      ),
    lastSeenAt:
      validDateOrNull(
        incident.last_seen_at,
        'last_seen_at'
      ),
    resolvedAt:
      validDateOrNull(
        incident.resolved_at,
        'resolved_at'
      ),
    lastNotificationAt:
      validDateOrNull(
        incident.last_notification_at,
        'last_notification_at'
      ),
    lastNotificationSeverity:
      incident.last_notification_severity ===
        null ||
      incident.last_notification_severity ===
        undefined
        ? null
        : String(
            incident.last_notification_severity
          ),
    nextNotificationAt:
      validDateOrNull(
        incident.next_notification_at,
        'next_notification_at'
      ),
    recoveryNotificationAt:
      validDateOrNull(
        incident.recovery_notification_at,
        'recovery_notification_at'
      ),
  };
}

function cooldownMsForSeverity(
  severity
) {
  if (severity === 'critical') {
    return CRITICAL_REMINDER_MS;
  }

  if (severity === 'warning') {
    return WARNING_REMINDER_MS;
  }

  throw policyError(
    'OPERATIONAL_NOTIFICATION_INVALID_SEVERITY',
    'Operational incident severity is invalid'
  );
}

function notificationDecisionForIncident(
  incident,
  {
    now = new Date(),
  } = {}
) {
  const normalized =
    normalizeIncident(
      incident
    );

  const evaluatedAt =
    validDateOrNull(
      now,
      'now'
    );

  if (!evaluatedAt) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_TIME',
      'Notification evaluation time is invalid'
    );
  }

  if (normalized.resolvedAt) {
    if (
      normalized.recoveryNotificationAt
    ) {
      return {
        notify: false,
        reason:
          'recovery_already_recorded',
      };
    }

    if (
      !normalized.lastNotificationAt
    ) {
      return {
        notify: false,
        reason:
          'never_notified_while_active',
      };
    }

    return {
      notify: true,
      kind: 'recovered',
      incident_id:
        normalized.id,
      severity:
        normalized.severity,
      decided_at:
        evaluatedAt.toISOString(),
    };
  }

  if (
    !normalized.lastNotificationAt
  ) {
    return {
      notify: true,
      kind: 'opened',
      incident_id:
        normalized.id,
      severity:
        normalized.severity,
      decided_at:
        evaluatedAt.toISOString(),
    };
  }

  if (
    normalized.severity ===
      'critical' &&
    normalized.lastNotificationSeverity ===
      'warning'
  ) {
    return {
      notify: true,
      kind: 'escalated',
      incident_id:
        normalized.id,
      severity: 'critical',
      decided_at:
        evaluatedAt.toISOString(),
    };
  }

  if (
    normalized.nextNotificationAt &&
    evaluatedAt.getTime() >=
      normalized.nextNotificationAt.getTime()
  ) {
    return {
      notify: true,
      kind: 'reminder',
      incident_id:
        normalized.id,
      severity:
        normalized.severity,
      decided_at:
        evaluatedAt.toISOString(),
    };
  }

  return {
    notify: false,
    reason: 'cooldown_active',
  };
}

function nextNotificationAt({
  severity,
  notifiedAt,
}) {
  const timestamp =
    validDateOrNull(
      notifiedAt,
      'notifiedAt'
    );

  if (!timestamp) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_TIME',
      'Notification timestamp is invalid'
    );
  }

  return new Date(
    timestamp.getTime() +
      cooldownMsForSeverity(
        severity
      )
  );
}

async function recordNotificationDecision({
  dbClient,
  incidentId,
  kind,
  severity,
  notifiedAt = new Date(),
}) {
  if (
    !dbClient ||
    typeof dbClient.query !==
      'function'
  ) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_DB_CLIENT_REQUIRED',
      'Database transaction client is required'
    );
  }

  const id =
    Number(incidentId);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !VALID_NOTIFICATION_KINDS.has(
      kind
    ) ||
    !VALID_SEVERITIES.has(
      severity
    )
  ) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_DECISION',
      'Notification decision is invalid'
    );
  }

  const timestamp =
    validDateOrNull(
      notifiedAt,
      'notifiedAt'
    );

  if (!timestamp) {
    throw policyError(
      'OPERATIONAL_NOTIFICATION_INVALID_TIME',
      'Notification timestamp is invalid'
    );
  }

  if (kind === 'recovered') {
    const result =
      await dbClient.query(
        `UPDATE operational_incidents
         SET recovery_notification_at = $2
         WHERE id = $1
           AND resolved_at IS NOT NULL
           AND recovery_notification_at IS NULL
         RETURNING
           id,
           recovery_notification_at`,
        [
          id,
          timestamp,
        ]
      );

    return {
      recorded:
        result.rows.length === 1,
      row:
        result.rows[0] ||
        null,
    };
  }

  const dueAt =
    nextNotificationAt({
      severity,
      notifiedAt:
        timestamp,
    });

  const result =
    await dbClient.query(
      `UPDATE operational_incidents
       SET
         last_notification_at = $2,
         last_notification_severity = $3,
         next_notification_at = $4
       WHERE id = $1
         AND resolved_at IS NULL
       RETURNING
         id,
         last_notification_at,
         last_notification_severity,
         next_notification_at`,
      [
        id,
        timestamp,
        severity,
        dueAt,
      ]
    );

  return {
    recorded:
      result.rows.length === 1,
    row:
      result.rows[0] ||
      null,
  };
}

module.exports = {
  WARNING_REMINDER_MS,
  CRITICAL_REMINDER_MS,
  cooldownMsForSeverity,
  notificationDecisionForIncident,
  nextNotificationAt,
  recordNotificationDecision,
};
