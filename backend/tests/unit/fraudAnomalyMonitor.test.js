'use strict';

jest.mock(
  '../../src/config/database',
  () => ({
    pool: {
      connect:
        jest.fn(),
    },
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info:
        jest.fn(),
      warn:
        jest.fn(),
      error:
        jest.fn(),
    },
  })
);

const {
  FRAUD_MONITOR_LOCK_KEY,
  fraudMonitorEnabled,
  tryAcquireFraudLeadership,
  releaseFraudLeadership,
  selectCandidateActors,
  loadCandidateEvents,
  runFraudAnomalyEvaluation,
} = require(
  '../../src/services/fraudAnomalyMonitor'
);

describe(
  'fraud anomaly monitor',
  () => {
    test(
      'uses a dedicated advisory lock key',
      () => {
        expect(
          FRAUD_MONITOR_LOCK_KEY
        ).toBe(214672152);
      }
    );

    test(
      'requires explicit feature enablement',
      () => {
        expect(
          fraudMonitorEnabled({})
        ).toBe(false);

        expect(
          fraudMonitorEnabled({
            FRAUD_ANOMALY_MONITOR_ENABLED:
              'true',
          })
        ).toBe(true);
      }
    );

    test(
      'acquires advisory leadership',
      async () => {
        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [{
                  acquired: true,
                }],
              }),
          release:
            jest.fn(),
        };

        const dbPool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        const result =
          await tryAcquireFraudLeadership({
            dbPool,
          });

        expect(result)
          .toBe(client);

        expect(
          client.query
            .mock.calls[0][0]
        ).toContain(
          'pg_try_advisory_lock'
        );
      }
    );

    test(
      'releases client when leadership is unavailable',
      async () => {
        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [{
                  acquired: false,
                }],
              }),
          release:
            jest.fn(),
        };

        const dbPool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        await expect(
          tryAcquireFraudLeadership({
            dbPool,
          })
        ).resolves.toBeNull();

        expect(
          client.release
        ).toHaveBeenCalledTimes(1);
      }
    );

    test(
      'releases advisory leadership',
      async () => {
        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [{
                  released: true,
                }],
              }),
          release:
            jest.fn(),
        };

        await releaseFraudLeadership({
          client,
        });

        expect(
          client.query
            .mock.calls[0][0]
        ).toContain(
          'pg_advisory_unlock'
        );

        expect(
          client.release
        ).toHaveBeenCalledTimes(1);
      }
    );

    test(
      'candidate selection is aggregate and bounded',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    actor_user_id:
                      '11111111-1111-4111-8111-111111111111',
                  },
                  {
                    actor_user_id:
                      '22222222-2222-4222-8222-222222222222',
                  },
                ],
              }),
        };

        const result =
          await selectCandidateActors({
            dbClient,
            evaluatedAt:
              '2026-09-14T14:00:00.000Z',
            limit: 1,
          });

        const [
          sql,
          params,
        ] =
          dbClient.query
            .mock.calls[0];

        expect(sql)
          .toContain(
            'GROUP BY actor_user_id'
          );

        expect(sql)
          .toContain(
            'transaction.initiated'
          );

        expect(sql)
          .toContain(
            'transaction.pending_confirmation'
          );

        expect(params[2])
          .toBe(2);

        expect(
          result.actor_user_ids
        ).toHaveLength(1);

        expect(
          result.saturated
        ).toBe(true);
      }
    );

    test(
      'event loading uses per-actor row number bound',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [],
              }),
        };

        await loadCandidateEvents({
          dbClient,
          actorUserIds: [
            '11111111-1111-4111-8111-111111111111',
          ],
          evaluatedAt:
            '2026-09-14T14:00:00.000Z',
        });

        const sql =
          dbClient.query
            .mock.calls[0][0];

        expect(sql)
          .toContain(
            'ROW_NUMBER() OVER'
          );

        expect(sql)
          .toContain(
            'actor_rank <= $4'
          );
      }
    );

    test(
      'runs evaluation and persists only non-enforcing result',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [{
                  actor_user_id:
                    '11111111-1111-4111-8111-111111111111',
                }],
              })
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [],
              }),
        };

        const evaluateFn =
          jest.fn()
            .mockReturnValue({
              evaluated_at:
                '2026-09-14T14:00:00.000Z',
              evaluated_event_count:
                0,
              signal_count:
                0,
              enforcement_action:
                'none',
              signals: [],
            });

        const persistFn =
          jest.fn()
            .mockResolvedValue({
              created_count: 0,
              existing_count: 0,
            });

        const result =
          await runFraudAnomalyEvaluation({
            dbClient,
            now:
              '2026-09-14T14:00:00.000Z',
            evaluateFn,
            persistFn,
          });

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toBe('BEGIN');

        expect(
          persistFn
        ).toHaveBeenCalledTimes(1);

        expect(
          dbClient.query
            .mock.calls[
              dbClient.query
                .mock.calls
                .length - 1
            ][0]
        ).toBe('COMMIT');

        expect(
          result.enforcement_action
        ).toBe('none');
      }
    );

    test(
      'rolls back when evaluation attempts enforcement',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [],
              }),
        };

        const evaluateFn =
          jest.fn()
            .mockReturnValue({
              evaluated_at:
                '2026-09-14T14:00:00.000Z',
              evaluated_event_count:
                0,
              signal_count:
                0,
              enforcement_action:
                'block',
              signals: [],
            });

        await expect(
          runFraudAnomalyEvaluation({
            dbClient,
            now:
              '2026-09-14T14:00:00.000Z',
            evaluateFn,
            persistFn:
              jest.fn(),
          })
        ).rejects.toThrow(
          'refuses enforcing evaluation'
        );

        expect(
          dbClient.query
            .mock.calls[
              dbClient.query
                .mock.calls
                .length - 1
            ][0]
        ).toBe('ROLLBACK');
      }
    );
  }
);
