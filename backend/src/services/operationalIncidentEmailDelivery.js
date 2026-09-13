'use strict';

const {
  query,
} = require('../config/database');

const {
  sendOperationalIncidentEmail,
} = require('./emailService');

const {
  logger,
} = require('../utils/logger');

const CRITICAL_EMAIL_REMINDER_MS =
  30 * 60 * 1000;

const MAX_EMAILS_PER_RUN = 50;

function operationalAlertRecipient(
  env = process.env
) {
  const recipient =
    String(
      env.OPERATIONAL_ALERT_EMAIL_TO ||
        ''
    ).trim();

  if (!recipient) {
    return null;
  }

  if (
    recipient.includes(',') ||
    recipient.includes('\n') ||
    recipient.includes('\r')
  ) {
    const error =
      new Error(
        'OPERATIONAL_ALERT_EMAIL_TO must contain one mailbox or distribution-list address'
      );

    error.code =
      'OPERATIONAL_ALERT_EMAIL_INVALID_RECIPIENT';

    throw error;
  }

  return recipient;
}

function validDateOrNull(value) {
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
    const error =
      new Error(
        'Operational incident email state contains an invalid timestamp'
      );

    error.code =
      'OPERATIONAL_ALERT_EMAIL_INVALID_STATE';

    throw error;
  }

  return date;
}

function emailDecisionForIncident(
  incident,
  now = new Date()
) {
  const timestamp =
    validDateOrNull(now);

  if (!timestamp) {
    throw new Error(
      'Operational incident email evaluation time is required'
    );
  }

  const resolvedAt =
    validDateOrNull(
      incident.resolved_at
    );

  const lastEmailAt =
    validDateOrNull(
      incident.last_email_at
    );

  const nextEmailAt =
    validDateOrNull(
      incident.next_email_at
    );

  const recoveryEmailAt =
    validDateOrNull(
      incident.recovery_email_at
    );

  if (resolvedAt) {
    if (
      lastEmailAt &&
      !recoveryEmailAt
    ) {
      return {
        send: true,
        kind: 'recovered',
      };
    }

    return {
      send: false,
      reason:
        lastEmailAt
          ? 'recovery_already_sent'
          : 'never_emailed_while_active',
    };
  }

  if (
    String(
      incident.severity
    ) !== 'critical'
  ) {
    return {
      send: false,
      reason:
        'not_critical',
    };
  }

  if (!lastEmailAt) {
    return {
      send: true,
      kind: 'opened',
    };
  }

  if (
    nextEmailAt &&
    timestamp.getTime() >=
      nextEmailAt.getTime()
  ) {
    return {
      send: true,
      kind: 'reminder',
    };
  }

  return {
    send: false,
    reason:
      'email_cooldown_active',
  };
}

function operationalEmailIdempotencyKey({
  incident,
  decision,
}) {
  const id =
    String(incident.id);

  if (
    decision.kind ===
      'recovered'
  ) {
    return (
      `operational-incident/${id}/critical-recovered`
    );
  }

  if (
    decision.kind ===
      'reminder'
  ) {
    const due =
      validDateOrNull(
        incident.next_email_at
      );

    if (!due) {
      throw new Error(
        'Critical reminder requires next_email_at'
      );
    }

    return [
      'operational-incident',
      id,
      'critical-reminder',
      due.toISOString(),
    ].join('/');
  }

  return (
    `operational-incident/${id}/critical-opened`
  );
}

async function selectDueEmailIncidents({
  now,
  queryFn = query,
}) {
  const result =
    await queryFn(
      `SELECT
         id,
         incident_key,
         alert_code,
         component,
         severity,
         first_seen_at,
         resolved_at,
         last_email_at,
         next_email_at,
         recovery_email_at
       FROM operational_incidents
       WHERE
         (
           resolved_at IS NULL
           AND severity = 'critical'
           AND (
             last_email_at IS NULL
             OR (
               next_email_at IS NOT NULL
               AND next_email_at <= $1
             )
           )
         )
         OR
         (
           resolved_at IS NOT NULL
           AND last_email_at IS NOT NULL
           AND recovery_email_at IS NULL
         )
       ORDER BY
         CASE
           WHEN resolved_at IS NOT NULL
             THEN 0
           ELSE 1
         END,
         COALESCE(
           next_email_at,
           first_seen_at
         ) ASC,
         id ASC
       LIMIT $2`,
      [
        now,
        MAX_EMAILS_PER_RUN,
      ]
    );

  return result.rows;
}

async function recordSuccessfulEmail({
  incident,
  decision,
  sentAt,
  queryFn = query,
}) {
  if (
    decision.kind ===
      'recovered'
  ) {
    const result =
      await queryFn(
        `UPDATE operational_incidents
         SET recovery_email_at = $2
         WHERE id = $1
           AND resolved_at IS NOT NULL
           AND last_email_at IS NOT NULL
           AND recovery_email_at IS NULL
         RETURNING id`,
        [
          incident.id,
          sentAt,
        ]
      );

    return (
      result.rows.length === 1
    );
  }

  const nextEmailAt =
    new Date(
      sentAt.getTime() +
        CRITICAL_EMAIL_REMINDER_MS
    );

  const result =
    await queryFn(
      `UPDATE operational_incidents
       SET
         last_email_at = $2,
         next_email_at = $3
       WHERE id = $1
         AND resolved_at IS NULL
         AND severity = 'critical'
       RETURNING id`,
      [
        incident.id,
        sentAt,
        nextEmailAt,
      ]
    );

  return (
    result.rows.length === 1
  );
}

async function processOperationalIncidentEmails({
  now = new Date(),
  env = process.env,
  queryFn = query,
  sendFn =
    sendOperationalIncidentEmail,
} = {}) {
  const recipient =
    operationalAlertRecipient(
      env
    );

  if (!recipient) {
    return {
      considered: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped_no_recipient: true,
    };
  }

  const timestamp =
    validDateOrNull(now);

  const incidents =
    await selectDueEmailIncidents({
      now: timestamp,
      queryFn,
    });

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const incident of incidents) {
    const decision =
      emailDecisionForIncident(
        incident,
        timestamp
      );

    if (!decision.send) {
      continue;
    }

    attempted += 1;

    const idempotencyKey =
      operationalEmailIdempotencyKey({
        incident,
        decision,
      });

    try {
      const result =
        await sendFn({
          to: recipient,
          incidentId:
            String(incident.id),
          incidentKey:
            String(
              incident.incident_key
            ),
          alertCode:
            String(
              incident.alert_code
            ),
          component:
            String(
              incident.component
            ),
          kind:
            decision.kind,
          idempotencyKey,
        });

      if (result?.skipped === true) {
        failed += 1;
        continue;
      }

      const recorded =
        await recordSuccessfulEmail({
          incident,
          decision,
          sentAt: timestamp,
          queryFn,
        });

      if (!recorded) {
        const error =
          new Error(
            'Operational incident email state was not advanced'
          );

        error.code =
          'OPERATIONAL_ALERT_EMAIL_STATE_ADVANCE_FAILED';

        throw error;
      }

      sent += 1;
    } catch (error) {
      failed += 1;

      logger.error(
        'Independent operational incident email failed',
        {
          errorCode:
            error?.code,
          incidentId:
            String(
              incident.id
            ),
          alertCode:
            String(
              incident.alert_code
            ),
        }
      );
    }
  }

  return {
    considered:
      incidents.length,
    attempted,
    sent,
    failed,
    skipped_no_recipient:
      false,
  };
}

module.exports = {
  CRITICAL_EMAIL_REMINDER_MS,
  MAX_EMAILS_PER_RUN,
  operationalAlertRecipient,
  emailDecisionForIncident,
  operationalEmailIdempotencyKey,
  selectDueEmailIncidents,
  recordSuccessfulEmail,
  processOperationalIncidentEmails,
};
