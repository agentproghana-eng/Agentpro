'use strict';

const {
  withTransaction,
} = require('../config/database');

const {
  enqueueOutboxEvent,
} = require('./outboxService');

const {
  notificationDecisionForIncident,
  recordNotificationDecision,
} = require(
  './operationalIncidentNotificationPolicy'
);

const MAX_INCIDENTS_PER_RUN = 50;

function deliveryError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code = code;

  return error;
}

function normalizeNow(now) {
  const date =
    now instanceof Date
      ? now
      : new Date(now);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw deliveryError(
      'OPERATIONAL_NOTIFICATION_INVALID_TIME',
      'Operational notification delivery time is invalid'
    );
  }

  return date;
}

function buildNotificationContent({
  kind,
  severity,
  component,
}) {
  const severityLabel =
    severity === 'critical'
      ? 'Critical'
      : 'Warning';

  if (kind === 'recovered') {
    return {
      title:
        '✅ AgentPro Incident Recovered',
      body:
        `${component} has recovered and the operational incident is resolved.`,
    };
  }

  if (kind === 'escalated') {
    return {
      title:
        '🔴 AgentPro Incident Escalated',
      body:
        `${component} has escalated to critical severity.`,
    };
  }

  if (kind === 'reminder') {
    return {
      title:
        severity === 'critical'
          ? '🔴 AgentPro Critical Incident'
          : '⚠️ AgentPro Incident Reminder',
      body:
        `${severityLabel}: ${component} incident remains unresolved.`,
    };
  }

  return {
    title:
      severity === 'critical'
        ? '🔴 AgentPro Critical Incident'
        : '⚠️ AgentPro Operational Incident',
    body:
      `${severityLabel}: ${component} requires attention.`,
  };
}

function notificationDedupeKey({
  incidentId,
  kind,
  recipientId,
  decidedAt,
}) {
  return [
    'operational-incident',
    String(incidentId),
    kind,
    decidedAt,
    String(recipientId),
  ].join(':');
}

async function selectDueIncidents({
  dbClient,
  now,
}) {
  const result =
    await dbClient.query(
      `SELECT
         id,
         incident_key,
         alert_code,
         component,
         severity,
         first_seen_at,
         last_seen_at,
         resolved_at,
         last_notification_at,
         last_notification_severity,
         next_notification_at,
         recovery_notification_at
       FROM operational_incidents
       WHERE
         (
           resolved_at IS NULL
           AND (
             last_notification_at IS NULL
             OR (
               severity = 'critical'
               AND last_notification_severity = 'warning'
             )
             OR (
               next_notification_at IS NOT NULL
               AND next_notification_at <= $1
             )
           )
         )
         OR
         (
           resolved_at IS NOT NULL
           AND last_notification_at IS NOT NULL
           AND recovery_notification_at IS NULL
         )
       ORDER BY
         CASE
           WHEN resolved_at IS NOT NULL
             THEN 0
           WHEN severity = 'critical'
             THEN 1
           ELSE 2
         END,
         COALESCE(
           next_notification_at,
           first_seen_at
         ) ASC,
         id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2`,
      [
        now,
        MAX_INCIDENTS_PER_RUN,
      ]
    );

  return result.rows;
}

async function selectActiveSuperusers({
  dbClient,
}) {
  const result =
    await dbClient.query(
      `SELECT id
       FROM users
       WHERE role = 'superuser'
         AND status = 'active'
       ORDER BY id ASC`
    );

  return result.rows.map(
    (row) => String(row.id)
  );
}

async function enqueueIncidentForRecipient({
  dbClient,
  incident,
  decision,
  recipientId,
}) {
  const content =
    buildNotificationContent({
      kind:
        decision.kind,
      severity:
        decision.severity,
      component:
        incident.component,
    });

  const dedupeKey =
    notificationDedupeKey({
      incidentId:
        incident.id,
      kind:
        decision.kind,
      recipientId,
      decidedAt:
        decision.decided_at,
    });

  return enqueueOutboxEvent({
    dbClient,
    eventType:
      'notification.operational_incident',
    aggregateType:
      'operational_incident',
    aggregateId: null,
    dedupeKey,
    payload: {
      user_id:
        String(recipientId),
      incident_id:
        String(incident.id),
      incident_key:
        String(
          incident.incident_key
        ),
      alert_code:
        String(
          incident.alert_code
        ),
      component:
        String(
          incident.component
        ),
      severity:
        String(
          decision.severity
        ),
      kind:
        String(
          decision.kind
        ),
      title:
        content.title,
      body:
        content.body,
    },
  });
}

async function processOperationalIncidentNotifications({
  now = new Date(),
} = {}) {
  const timestamp =
    normalizeNow(now);

  return withTransaction(
    async (client) => {
      const incidents =
        await selectDueIncidents({
          dbClient: client,
          now: timestamp,
        });

      if (
        incidents.length === 0
      ) {
        return {
          considered: 0,
          enqueued: 0,
          state_advanced: 0,
          no_recipients: false,
        };
      }

      const recipientIds =
        await selectActiveSuperusers({
          dbClient: client,
        });

      if (
        recipientIds.length === 0
      ) {
        return {
          considered:
            incidents.length,
          enqueued: 0,
          state_advanced: 0,
          no_recipients: true,
        };
      }

      let enqueued = 0;
      let stateAdvanced = 0;

      for (
        const incident
        of incidents
      ) {
        const decision =
          notificationDecisionForIncident(
            incident,
            {
              now: timestamp,
            }
          );

        if (!decision.notify) {
          continue;
        }

        for (
          const recipientId
          of recipientIds
        ) {
          await enqueueIncidentForRecipient({
            dbClient: client,
            incident,
            decision,
            recipientId,
          });

          enqueued += 1;
        }

        const recorded =
          await recordNotificationDecision({
            dbClient: client,
            incidentId:
              incident.id,
            kind:
              decision.kind,
            severity:
              decision.severity,
            notifiedAt:
              timestamp,
          });

        if (!recorded.recorded) {
          throw deliveryError(
            'OPERATIONAL_NOTIFICATION_STATE_ADVANCE_FAILED',
            'Operational notification state could not be advanced'
          );
        }

        stateAdvanced += 1;
      }

      return {
        considered:
          incidents.length,
        enqueued,
        state_advanced:
          stateAdvanced,
        no_recipients: false,
      };
    }
  );
}

module.exports = {
  MAX_INCIDENTS_PER_RUN,
  buildNotificationContent,
  notificationDedupeKey,
  selectDueIncidents,
  selectActiveSuperusers,
  enqueueIncidentForRecipient,
  processOperationalIncidentNotifications,
};
