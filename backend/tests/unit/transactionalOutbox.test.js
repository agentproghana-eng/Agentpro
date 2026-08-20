const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockLoggerError = jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query: (...args) =>
      mockQuery(...args),

    withTransaction: (...args) =>
      mockWithTransaction(...args),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: (...args) =>
        mockLoggerError(...args),
      info: jest.fn(),
      warn: jest.fn(),
    },
  })
);

const {
  enqueueOutboxEvent,
  claimOutboxBatch,
  markOutboxFailed,
  serializeSafePayload,
} = require(
  '../../src/services/outboxService'
);

const {
  retryDelaySeconds,
  runOutboxBatch,
} = require(
  '../../src/services/outboxWorker'
);

describe(
  'transactional outbox foundation',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockWithTransaction
        .mockImplementation(
          async (callback) =>
            callback({
              query: mockClientQuery,
            })
        );
    });

    test(
      'migration creates durable outbox table and dispatch indexes',
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../migrations/091_transactional_outbox.sql'
            ),
            'utf8'
          );

        expect(migration)
          .toContain(
            'CREATE TABLE outbox_events'
          );

        expect(migration)
          .toContain(
            'UNIQUE (dedupe_key)'
          );

        expect(migration)
          .toContain(
            "'dead_letter'"
          );

        expect(migration)
          .toContain(
            'idx_outbox_events_dispatch_pending'
          );

        expect(migration)
          .toContain(
            'idx_outbox_events_processing_stale'
          );
      }
    );

    test(
      'enqueue requires the caller transaction client',
      async () => {
        await expect(
          enqueueOutboxEvent({
            eventType:
              'notification.transaction.completed',
            aggregateType:
              'transaction',
            aggregateId:
              '11111111-1111-1111-1111-111111111111',
            dedupeKey:
              'transaction:test:completed',
            payload: {
              transaction_id:
                '11111111-1111-1111-1111-111111111111',
            },
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_TRANSACTION_CLIENT_REQUIRED',
        });
      }
    );

    test.each([
      {
        pin: '1234',
      },
      {
        auth: {
          refresh_token: 'secret',
        },
      },
      {
        metadata: {
          ussd_session_log: [],
        },
      },
      {
        credentials: {
          private_key: 'secret',
        },
      },
    ])(
      'rejects sensitive payload keys %#',
      async (payload) => {
        const dbClient = {
          query: jest.fn(),
        };

        await expect(
          enqueueOutboxEvent({
            dbClient,
            eventType:
              'notification.transaction.completed',
            aggregateType:
              'transaction',
            aggregateId:
              '11111111-1111-1111-1111-111111111111',
            dedupeKey:
              `safe-test:${JSON.stringify(
                payload
              )}`,
            payload,
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_SENSITIVE_PAYLOAD_REJECTED',
        });

        expect(
          dbClient.query
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'enqueues a safe event on the supplied transaction client',
      async () => {
        const dbClient = {
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  id:
                    '22222222-2222-2222-2222-222222222222',
                  status: 'pending',
                },
              ],
            }),
        };

        const result =
          await enqueueOutboxEvent({
            dbClient,
            eventType:
              'notification.transaction.completed',
            aggregateType:
              'transaction',
            aggregateId:
              '11111111-1111-1111-1111-111111111111',
            dedupeKey:
              'transaction:11111111:completion:success',
            payload: {
              agent_id:
                '33333333-3333-3333-3333-333333333333',
              type:
                'transaction_success',
              transaction: {
                id:
                  '11111111-1111-1111-1111-111111111111',
                amount: '25.00',
                transaction_type:
                  'cash_in',
                reference:
                  'TEST-REFERENCE',
                failure_reason: null,
              },
            },
          });

        expect(result)
          .toEqual({
            id:
              '22222222-2222-2222-2222-222222222222',
            status: 'pending',
            deduplicated: false,
          });

        expect(
          dbClient.query
        ).toHaveBeenCalledTimes(1);

        expect(
          dbClient.query.mock.calls[0][0]
        ).toContain(
          'ON CONFLICT (dedupe_key) DO NOTHING'
        );
      }
    );

    test(
      'dedupe conflict resolves the existing durable event',
      async () => {
        const dbClient = {
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [],
            })
            .mockResolvedValueOnce({
              rows: [
                {
                  id:
                    '22222222-2222-2222-2222-222222222222',
                  status: 'processed',
                },
              ],
            }),
        };

        const result =
          await enqueueOutboxEvent({
            dbClient,
            eventType:
              'notification.transaction.completed',
            aggregateType:
              'transaction',
            aggregateId:
              '11111111-1111-1111-1111-111111111111',
            dedupeKey:
              'transaction:11111111:completion:success',
            payload: {
              transaction_id:
                '11111111-1111-1111-1111-111111111111',
            },
          });

        expect(result.deduplicated)
          .toBe(true);

        expect(result.status)
          .toBe('processed');

        expect(
          dbClient.query
        ).toHaveBeenCalledTimes(2);
      }
    );

    test(
      'claim uses row locking with SKIP LOCKED and stale-claim recovery',
      async () => {
        mockClientQuery
          .mockResolvedValueOnce({
            rows: [],
          });

        await claimOutboxBatch({
          workerId:
            'worker-test',
          batchSize: 20,
          staleAfterSeconds: 300,
        });

        const sql =
          mockClientQuery
            .mock.calls[0][0];

        expect(sql)
          .toContain(
            'FOR UPDATE SKIP LOCKED'
          );

        expect(sql)
          .toContain(
            "status = 'processing'"
          );

        expect(sql)
          .toContain(
            'locked_at <='
          );

        expect(sql)
          .toContain(
            "status = 'pending'"
          );
      }
    );

    test(
      'failed delivery increments attempts and dead-letters at the limit',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  '22222222-2222-2222-2222-222222222222',
                status:
                  'dead_letter',
                attempts: 8,
                max_attempts: 8,
              },
            ],
          });

        await markOutboxFailed({
          eventId:
            '22222222-2222-2222-2222-222222222222',
          workerId:
            'worker-test',
          retryDelaySeconds: 60,
          errorCode:
            'FCM_UNAVAILABLE',
        });

        const [
          sql,
          params,
        ] = mockQuery.mock.calls[0];

        expect(sql)
          .toContain(
            'attempts = attempts + 1'
          );

        expect(sql)
          .toContain(
            "'dead_letter'"
          );

        expect(params)
          .toEqual([
            '22222222-2222-2222-2222-222222222222',
            'worker-test',
            60,
            'FCM_UNAVAILABLE',
          ]);
      }
    );

    test(
      'retry backoff is bounded',
      () => {
        expect(
          retryDelaySeconds(1)
        ).toBe(5);

        expect(
          retryDelaySeconds(2)
        ).toBe(10);

        expect(
          retryDelaySeconds(3)
        ).toBe(20);

        expect(
          retryDelaySeconds(50)
        ).toBe(3600);
      }
    );

    test(
      'worker dispatches a claimed event and marks it processed',
      async () => {
        mockClientQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  '22222222-2222-2222-2222-222222222222',
                event_type:
                  'notification.transaction.completed',
                attempts: 0,
                max_attempts: 8,
                payload: {
                  transaction_id:
                    '11111111-1111-1111-1111-111111111111',
                },
              },
            ],
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  '22222222-2222-2222-2222-222222222222',
                status:
                  'processed',
              },
            ],
          });

        const dispatchEvent =
          jest.fn()
            .mockResolvedValue();

        const result =
          await runOutboxBatch({
            dispatchEvent,
            workerId:
              'worker-test',
          });

        expect(
          dispatchEvent
        ).toHaveBeenCalledTimes(1);

        expect(result)
          .toEqual({
            claimed: 1,
            processed: 1,
            failed: 0,
          });

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          "status = 'processed'"
        );
      }
    );

    test(
      'payload serializer enforces the size ceiling',
      () => {
        expect(() =>
          serializeSafePayload({
            safe_text:
              'x'.repeat(
                20 * 1024
              ),
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OUTBOX_PAYLOAD_TOO_LARGE',
          })
        );
      }
    );
  }
);
