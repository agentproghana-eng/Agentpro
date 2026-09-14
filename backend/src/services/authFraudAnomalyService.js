'use strict';

const AUTH_SUBJECT_TYPE = 'user';

const AUTH_RULES = Object.freeze({
  auth_login_failure_burst_10m:
    Object.freeze({
      rule_id:
        'auth_login_failure_burst_10m',
      event_name:
        'auth.login.failed',
      window_ms:
        10 * 60 * 1000,
      threshold: 5,
      severity: 'high',
      risk_score: 75,
    }),

  auth_mfa_failure_burst_10m:
    Object.freeze({
      rule_id:
        'auth_mfa_failure_burst_10m',
      event_name:
        'auth.mfa.failed',
      window_ms:
        10 * 60 * 1000,
      threshold: 3,
      severity: 'critical',
      risk_score: 90,
    }),

  auth_password_reset_burst_10m:
    Object.freeze({
      rule_id:
        'auth_password_reset_burst_10m',
      event_name:
        'auth.password_reset.issued',
      window_ms:
        10 * 60 * 1000,
      threshold: 3,
      severity: 'medium',
      risk_score: 55,
    }),
});

const AUTH_EVENT_NAMES =
  Object.freeze(
    Object.values(AUTH_RULES)
      .map(rule => rule.event_name),
  );

const MAX_EVIDENCE_IDS = 20;

function validDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function uniqueLimited(
  values,
  limit = MAX_EVIDENCE_IDS,
) {
  return [
    ...new Set(
      values.filter(Boolean),
    ),
  ].slice(0, limit);
}

function bucketStartIso(
  date,
  windowMs,
) {
  const bucket =
    Math.floor(
      date.getTime() /
        windowMs,
    ) * windowMs;

  return new Date(bucket)
    .toISOString();
}

function matchingEvents({
  events,
  actorUserId,
  eventName,
  windowMs,
  evaluatedAt,
}) {
  const minimumTime =
    evaluatedAt.getTime() -
    windowMs;

  return events.filter(event => {
    if (
      event.actor_user_id !==
      actorUserId
    ) {
      return false;
    }

    if (
      event.subject_type !==
      AUTH_SUBJECT_TYPE
    ) {
      return false;
    }

    if (
      event.subject_id !==
      actorUserId
    ) {
      return false;
    }

    if (
      event.event_name !==
      eventName
    ) {
      return false;
    }

    const occurredAt =
      validDate(
        event.occurred_at,
      );

    if (!occurredAt) {
      return false;
    }

    const time =
      occurredAt.getTime();

    return (
      time >= minimumTime &&
      time <=
        evaluatedAt.getTime()
    );
  });
}

function buildAuthSignal({
  rule,
  actorUserId,
  events,
  evaluatedAt,
}) {
  const companyIds =
    uniqueLimited(
      events.map(
        event =>
          event.company_id ||
          null,
      ),
    );

  const windowStart =
    new Date(
      evaluatedAt.getTime() -
      rule.window_ms,
    );

  return {
    signal_type:
      'auth_anomaly',

    rule_id:
      rule.rule_id,

    severity:
      rule.severity,

    risk_score:
      rule.risk_score,

    subject_type:
      'user',

    subject_id:
      actorUserId,

    actor_user_id:
      actorUserId,

    company_id:
      companyIds.length === 1
        ? companyIds[0]
        : null,

    provider: null,

    window_started_at:
      windowStart.toISOString(),

    window_ended_at:
      evaluatedAt.toISOString(),

    observed_event_count:
      events.length,

    metrics: {
      threshold:
        rule.threshold,
      observed:
        events.length,
    },

    evidence: {
      event_ids:
        uniqueLimited(
          events.map(
            event => event.id,
          ),
        ),

      correlation_ids:
        uniqueLimited(
          events.map(
            event =>
              event.correlation_id,
          ),
        ),
    },

    dedupe_key: [
      'fraud',
      rule.rule_id,
      actorUserId,
      bucketStartIso(
        evaluatedAt,
        rule.window_ms,
      ),
    ].join(':'),
  };
}

function evaluateAuthAnomalies({
  events,
  now = new Date(),
} = {}) {
  const evaluatedAt =
    validDate(now);

  if (!evaluatedAt) {
    const error =
      new Error(
        'Invalid auth anomaly evaluation time',
      );

    error.code =
      'AUTH_FRAUD_EVALUATION_TIME_INVALID';

    throw error;
  }

  const safeEvents =
    Array.isArray(events)
      ? events
      : [];

  const actorUserIds =
    uniqueLimited(
      safeEvents.map(
        event =>
          event.actor_user_id ||
          null,
      ),
      Number.MAX_SAFE_INTEGER,
    );

  const signals = [];

  for (
    const actorUserId
    of actorUserIds
  ) {
    for (
      const rule
      of Object.values(
        AUTH_RULES,
      )
    ) {
      const matched =
        matchingEvents({
          events: safeEvents,
          actorUserId,
          eventName:
            rule.event_name,
          windowMs:
            rule.window_ms,
          evaluatedAt,
        });

      if (
        matched.length >=
        rule.threshold
      ) {
        signals.push(
          buildAuthSignal({
            rule,
            actorUserId,
            events: matched,
            evaluatedAt,
          }),
        );
      }
    }
  }

  signals.sort(
    (left, right) =>
      right.risk_score -
        left.risk_score ||
      left.rule_id.localeCompare(
        right.rule_id,
      ),
  );

  return {
    evaluated_at:
      evaluatedAt.toISOString(),

    evaluated_event_count:
      safeEvents.length,

    signal_count:
      signals.length,

    highest_risk_score:
      signals[0]
        ?.risk_score || 0,

    highest_severity:
      signals[0]
        ?.severity || null,

    enforcement_action:
      'none',

    signals,
  };
}

module.exports = {
  AUTH_RULES,
  AUTH_EVENT_NAMES,
  MAX_EVIDENCE_IDS,
  evaluateAuthAnomalies,
};
