'use strict';

const {
  RULES,
  MAX_EVIDENCE_IDS,
  evaluateTransactionAnomalies,
} = require(
  '../../src/services/fraudAnomalyService'
);

const NOW =
  new Date(
    '2026-09-14T11:00:00.000Z'
  );

function event({
  id,
  eventName,
  userId = 'user-1',
  companyId = 'company-1',
  provider = 'mtn',
  subjectId,
  minutesAgo = 0,
}) {
  return {
    id,
    event_name:
      eventName,
    actor_user_id:
      userId,
    company_id:
      companyId,
    subject_type:
      'transaction',
    subject_id:
      subjectId || id,
    correlation_id:
      `corr-${id}`,
    attributes: {
      provider,
    },
    occurred_at:
      new Date(
        NOW.getTime() -
          minutesAgo *
            60 *
            1000
      ).toISOString(),
  };
}

describe(
  'fraud anomaly service',
  () => {
    test(
      'returns no signals for ordinary transaction activity',
      () => {
        const events =
          Array.from(
            { length: 5 },
            (_, index) =>
              event({
                id:
                  `normal-${index}`,
                eventName:
                  'transaction.initiated',
                minutesAgo:
                  index,
              })
          );

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        expect(
          result.signal_count
        ).toBe(0);

        expect(
          result.highest_risk_score
        ).toBe(0);

        expect(
          result.enforcement_action
        ).toBe('none');
      }
    );

    test(
      'detects high transaction initiation velocity',
      () => {
        const threshold =
          RULES
            .transaction_velocity_5m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id:
                  `velocity-${index}`,
                eventName:
                  'transaction.initiated',
                minutesAgo:
                  index % 5,
              })
          );

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        const signal =
          result.signals.find(
            item =>
              item.rule_id ===
              'transaction_velocity_5m'
          );

        expect(signal)
          .toBeDefined();

        expect(
          signal
            .observed_event_count
        ).toBe(threshold);

        expect(
          signal.metrics.observed
        ).toBe(threshold);

        expect(
          signal.enforcement_action
        ).toBeUndefined();

        expect(
          result
            .enforcement_action
        ).toBe('none');
      }
    );

    test(
      'detects repeated transaction failures',
      () => {
        const threshold =
          RULES
            .transaction_failure_burst_10m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id:
                  `failed-${index}`,
                eventName:
                  'transaction.failed',
                minutesAgo:
                  index % 10,
              })
          );

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        expect(
          result.signals.some(
            signal =>
              signal.rule_id ===
              'transaction_failure_burst_10m'
          )
        ).toBe(true);

        expect(
          result.highest_risk_score
        ).toBeGreaterThanOrEqual(
          70
        );
      }
    );

    test(
      'detects repeated pending confirmations',
      () => {
        const threshold =
          RULES
            .transaction_pending_burst_10m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id:
                  `pending-${index}`,
                eventName:
                  'transaction.pending_confirmation',
                minutesAgo:
                  index % 10,
              })
          );

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        expect(
          result.signals.some(
            signal =>
              signal.rule_id ===
              'transaction_pending_burst_10m'
          )
        ).toBe(true);
      }
    );

    test(
      'detects high failure ratio only after minimum sample size',
      () => {
        const events = [];

        for (
          let index = 0;
          index < 8;
          index += 1
        ) {
          events.push(
            event({
              id:
                `ratio-fail-${index}`,
              eventName:
                'transaction.failed',
              minutesAgo:
                index % 10,
            })
          );
        }

        for (
          let index = 0;
          index < 4;
          index += 1
        ) {
          events.push(
            event({
              id:
                `ratio-ok-${index}`,
              eventName:
                'transaction.completed',
              minutesAgo:
                index % 10,
            })
          );
        }

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        const signal =
          result.signals.find(
            item =>
              item.rule_id ===
              'transaction_failure_ratio_10m'
          );

        expect(signal)
          .toBeDefined();

        expect(
          signal.metrics
            .terminal_events
        ).toBe(12);

        expect(
          signal.metrics
            .failed_events
        ).toBe(8);

        expect(
          signal.metrics
            .failure_ratio
        ).toBeCloseTo(
          0.6667,
          4
        );
      }
    );

    test(
      'does not count pending confirmations in failure ratio denominator',
      () => {
        const events = [];

        for (
          let index = 0;
          index < 6;
          index += 1
        ) {
          events.push(
            event({
              id:
                `ratio-failed-${index}`,
              eventName:
                'transaction.failed',
              minutesAgo:
                index % 10,
            })
          );

          events.push(
            event({
              id:
                `ratio-completed-${index}`,
              eventName:
                'transaction.completed',
              minutesAgo:
                index % 10,
            })
          );
        }

        for (
          let index = 0;
          index < 10;
          index += 1
        ) {
          events.push(
            event({
              id:
                `ratio-pending-${index}`,
              eventName:
                'transaction.pending_confirmation',
              minutesAgo:
                index % 10,
            })
          );
        }

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        const ratioSignal =
          result.signals.find(
            signal =>
              signal.rule_id ===
              'transaction_failure_ratio_10m'
          );

        expect(ratioSignal)
          .toBeDefined();

        expect(
          ratioSignal.metrics
            .terminal_events
        ).toBe(12);

        expect(
          ratioSignal.metrics
            .failed_events
        ).toBe(6);

        expect(
          ratioSignal.metrics
            .failure_ratio
        ).toBe(0.5);
      }
    );

    test(
      'does not mix unrelated users into one anomaly signal',
      () => {
        const perUser =
          RULES
            .transaction_velocity_5m
            .threshold - 1;

        const events = [];

        for (
          let index = 0;
          index < perUser;
          index += 1
        ) {
          events.push(
            event({
              id:
                `user1-${index}`,
              eventName:
                'transaction.initiated',
              userId:
                'user-1',
            })
          );

          events.push(
            event({
              id:
                `user2-${index}`,
              eventName:
                'transaction.initiated',
              userId:
                'user-2',
            })
          );
        }

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        expect(
          result.signal_count
        ).toBe(0);
      }
    );

    test(
      'ignores stale and non-transaction events',
      () => {
        const threshold =
          RULES
            .transaction_velocity_5m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) => ({
              ...event({
                id:
                  `stale-${index}`,
                eventName:
                  'transaction.initiated',
                minutesAgo: 30,
              }),
              subject_type:
                index === 0
                  ? 'user'
                  : 'transaction',
            })
          );

        const result =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        expect(
          result.signal_count
        ).toBe(0);
      }
    );

    test(
      'caps evidence identifiers and creates deterministic dedupe keys',
      () => {
        const threshold =
          RULES
            .transaction_velocity_5m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id:
                  `evidence-${index}`,
                eventName:
                  'transaction.initiated',
              })
          );

        const first =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        const second =
          evaluateTransactionAnomalies({
            events,
            now: NOW,
          });

        const firstSignal =
          first.signals.find(
            item =>
              item.rule_id ===
              'transaction_velocity_5m'
          );

        const secondSignal =
          second.signals.find(
            item =>
              item.rule_id ===
              'transaction_velocity_5m'
          );

        expect(
          firstSignal
            .evidence
            .event_ids.length
        ).toBeLessThanOrEqual(
          MAX_EVIDENCE_IDS
        );

        expect(
          firstSignal.dedupe_key
        ).toBe(
          secondSignal
            .dedupe_key
        );
      }
    );

    test(
      'rejects invalid evaluation time',
      () => {
        expect(
          () =>
            evaluateTransactionAnomalies({
              events: [],
              now:
                'not-a-date',
            })
        ).toThrow(
          'Invalid anomaly evaluation time'
        );
      }
    );
  }
);
