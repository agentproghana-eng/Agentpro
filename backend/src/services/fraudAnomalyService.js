'use strict';

const TRANSACTION_SUBJECT_TYPES =
  new Set([
    'transaction',
    'personal_transaction',
  ]);

const SEVERITY_RANK = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

const RULES = Object.freeze({
  transaction_velocity_5m: Object.freeze({
    rule_id:
      'transaction_velocity_5m',
    event_name:
      'transaction.initiated',
    window_ms:
      5 * 60 * 1000,
    threshold: 30,
    severity: 'medium',
    risk_score: 45,
  }),

  transaction_failure_burst_10m:
    Object.freeze({
      rule_id:
        'transaction_failure_burst_10m',
      event_name:
        'transaction.failed',
      window_ms:
        10 * 60 * 1000,
      threshold: 10,
      severity: 'high',
      risk_score: 70,
    }),

  transaction_pending_burst_10m:
    Object.freeze({
      rule_id:
        'transaction_pending_burst_10m',
      event_name:
        'transaction.pending_confirmation',
      window_ms:
        10 * 60 * 1000,
      threshold: 6,
      severity: 'high',
      risk_score: 60,
    }),

  transaction_failure_ratio_10m:
    Object.freeze({
      rule_id:
        'transaction_failure_ratio_10m',
      window_ms:
        10 * 60 * 1000,
      minimum_terminal_events: 12,
      failure_ratio_threshold: 0.5,
      severity: 'high',
      risk_score: 75,
    }),
});

const MAX_EVIDENCE_IDS = 20;

function validDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function uniqueLimited(
  values,
  limit = MAX_EVIDENCE_IDS
) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ].slice(0, limit);
}

function providerForEvents(events) {
  const providers =
    uniqueLimited(
      events.map(
        event =>
          event.attributes
            ?.provider ||
          null
      )
    );

  return providers.length === 1
    ? providers[0]
    : null;
}

function companyForEvents(events) {
  const companies =
    uniqueLimited(
      events.map(
        event =>
          event.company_id ||
          null
      )
    );

  return companies.length === 1
    ? companies[0]
    : null;
}

function evidenceForEvents(events) {
  return {
    event_ids:
      uniqueLimited(
        events.map(
          event => event.id
        )
      ),

    transaction_ids:
      uniqueLimited(
        events.map(
          event =>
            TRANSACTION_SUBJECT_TYPES
              .has(
                event.subject_type
              )
              ? event.subject_id
              : null
        )
      ),

    correlation_ids:
      uniqueLimited(
        events.map(
          event =>
            event.correlation_id
        )
      ),
  };
}

function bucketStartIso(
  date,
  windowMs
) {
  const bucket =
    Math.floor(
      date.getTime() /
        windowMs
    ) * windowMs;

  return new Date(bucket)
    .toISOString();
}

function buildSignal({
  rule,
  actorUserId,
  events,
  evaluatedAt,
  metrics = {},
}) {
  const windowStart =
    new Date(
      evaluatedAt.getTime() -
        rule.window_ms
    );

  return {
    signal_type:
      'transaction_anomaly',

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
      companyForEvents(
        events
      ),

    provider:
      providerForEvents(
        events
      ),

    window_started_at:
      windowStart.toISOString(),

    window_ended_at:
      evaluatedAt
        .toISOString(),

    observed_event_count:
      events.length,

    metrics,

    evidence:
      evidenceForEvents(
        events
      ),

    dedupe_key: [
      'fraud',
      rule.rule_id,
      actorUserId,
      bucketStartIso(
        evaluatedAt,
        rule.window_ms
      ),
    ].join(':'),
  };
}

function eventsWithinWindow({
  events,
  actorUserId,
  eventNames,
  windowMs,
  evaluatedAt,
}) {
  const minimumTime =
    evaluatedAt.getTime() -
    windowMs;

  return events.filter(
    event => {
      if (
        event.actor_user_id !==
        actorUserId
      ) {
        return false;
      }

      if (
        !TRANSACTION_SUBJECT_TYPES
          .has(
            event.subject_type
          )
      ) {
        return false;
      }

      if (
        eventNames &&
        !eventNames.has(
          event.event_name
        )
      ) {
        return false;
      }

      const occurredAt =
        validDate(
          event.occurred_at
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
    }
  );
}

function evaluateActor({
  actorUserId,
  events,
  evaluatedAt,
}) {
  const signals = [];

  for (
    const rule of [
      RULES
        .transaction_velocity_5m,
      RULES
        .transaction_failure_burst_10m,
      RULES
        .transaction_pending_burst_10m,
    ]
  ) {
    const matchingEvents =
      eventsWithinWindow({
        events,
        actorUserId,
        eventNames:
          new Set([
            rule.event_name,
          ]),
        windowMs:
          rule.window_ms,
        evaluatedAt,
      });

    if (
      matchingEvents.length >=
      rule.threshold
    ) {
      signals.push(
        buildSignal({
          rule,
          actorUserId,
          events:
            matchingEvents,
          evaluatedAt,
          metrics: {
            threshold:
              rule.threshold,
            observed:
              matchingEvents
                .length,
          },
        })
      );
    }
  }

  const ratioRule =
    RULES
      .transaction_failure_ratio_10m;

  const terminalEvents =
    eventsWithinWindow({
      events,
      actorUserId,
      eventNames:
        new Set([
          'transaction.completed',
          'transaction.failed',
        ]),
      windowMs:
        ratioRule.window_ms,
      evaluatedAt,
    });

  const failedEvents =
    terminalEvents.filter(
      event =>
        event.event_name ===
        'transaction.failed'
    );

  const failureRatio =
    terminalEvents.length
      ? (
          failedEvents.length /
          terminalEvents.length
        )
      : 0;

  if (
    terminalEvents.length >=
      ratioRule
        .minimum_terminal_events &&
    failureRatio >=
      ratioRule
        .failure_ratio_threshold
  ) {
    signals.push(
      buildSignal({
        rule:
          ratioRule,
        actorUserId,
        events:
          terminalEvents,
        evaluatedAt,
        metrics: {
          terminal_events:
            terminalEvents.length,
          failed_events:
            failedEvents.length,
          failure_ratio:
            Number(
              failureRatio
                .toFixed(4)
            ),
          minimum_terminal_events:
            ratioRule
              .minimum_terminal_events,
          failure_ratio_threshold:
            ratioRule
              .failure_ratio_threshold,
        },
      })
    );
  }

  return signals;
}

function evaluateTransactionAnomalies({
  events,
  now = new Date(),
} = {}) {
  const evaluatedAt =
    validDate(now);

  if (!evaluatedAt) {
    const error =
      new Error(
        'Invalid anomaly evaluation time'
      );

    error.code =
      'FRAUD_EVALUATION_TIME_INVALID';

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
          null
      ),
      Number.MAX_SAFE_INTEGER
    );

  const signals =
    actorUserIds
      .flatMap(
        actorUserId =>
          evaluateActor({
            actorUserId,
            events:
              safeEvents,
            evaluatedAt,
          })
      )
      .sort(
        (left, right) =>
          right.risk_score -
            left.risk_score ||
          left.rule_id
            .localeCompare(
              right.rule_id
            )
      );

  const highestSignal =
    signals.reduce(
      (current, signal) => {
        if (!current) {
          return signal;
        }

        const currentRank =
          SEVERITY_RANK[
            current.severity
          ] || 0;

        const signalRank =
          SEVERITY_RANK[
            signal.severity
          ] || 0;

        if (
          signal.risk_score >
          current.risk_score
        ) {
          return signal;
        }

        if (
          signal.risk_score ===
            current.risk_score &&
          signalRank >
            currentRank
        ) {
          return signal;
        }

        return current;
      },
      null
    );

  return {
    evaluated_at:
      evaluatedAt
        .toISOString(),

    evaluated_event_count:
      safeEvents.length,

    signal_count:
      signals.length,

    highest_risk_score:
      highestSignal
        ?.risk_score || 0,

    highest_severity:
      highestSignal
        ?.severity || null,

    enforcement_action:
      'none',

    signals,
  };
}

module.exports = {
  RULES,
  MAX_EVIDENCE_IDS,
  evaluateTransactionAnomalies,
};
