'use strict';

const {
  normalizeSearch,
  buildCaseSummary,
  searchSupportTimeline,
} = require(
  '../../src/services/supportTimelineService'
);

describe(
  'support timeline service',
  () => {
    test(
      'rejects malformed UUID search',
      () => {
        expect(() =>
          normalizeSearch({
            type:
              'transaction_id',
            value:
              'not-a-uuid',
          })
        ).toThrow(
          'A valid UUID is required'
        );
      }
    );

    test(
      'rejects unsupported search type',
      () => {
        expect(() =>
          normalizeSearch({
            type: 'anything',
            value: 'test',
          })
        ).toThrow(
          'Unsupported support search type'
        );
      }
    );

    test(
      'resolves exact email without returning email in identity',
      async () => {
        const dbQuery =
          jest.fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  id:
                    '11111111-1111-4111-8111-111111111111',
                  first_name:
                    'Test',
                  last_name:
                    'User',
                  role:
                    'agent',
                  company_id:
                    '22222222-2222-4222-8222-222222222222',
                },
              ],
            })
            .mockResolvedValueOnce({
              rows: [],
            });

        const result =
          await searchSupportTimeline({
            type: 'email',
            value:
              'person@example.com',
            dbQuery,
          });

        expect(
          result.identities
        ).toEqual([
          {
            id:
              '11111111-1111-4111-8111-111111111111',
            first_name:
              'Test',
            last_name:
              'User',
            role:
              'agent',
            company_id:
              '22222222-2222-4222-8222-222222222222',
          },
        ]);

        expect(
          result.identities[0]
        ).not.toHaveProperty(
          'email'
        );

        expect(
          result.identities[0]
        ).not.toHaveProperty(
          'phone'
        );
      }
    );

    test(
      'expands transaction search to correlated timeline',
      async () => {
        const correlationId =
          '33333333-3333-4333-8333-333333333333';

        const dbQuery =
          jest.fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  correlation_id:
                    correlationId,
                },
              ],
            })
            .mockResolvedValueOnce({
              rows: [
                {
                  id:
                    '44444444-4444-4444-8444-444444444444',
                  event_name:
                    'transaction.initiated',
                  event_version: 1,
                  source: 'backend',
                  actor_user_id:
                    '11111111-1111-4111-8111-111111111111',
                  company_id:
                    null,
                  subject_type:
                    'personal_transaction',
                  subject_id:
                    '55555555-5555-4555-8555-555555555555',
                  correlation_id:
                    correlationId,
                  causation_event_id:
                    null,
                  attributes: {
                    provider: 'mtn',
                  },
                  occurred_at:
                    '2026-09-14T09:00:00.000Z',
                  recorded_at:
                    '2026-09-14T09:00:00.000Z',
                },
              ],
            });

        const result =
          await searchSupportTimeline({
            type:
              'transaction_id',
            value:
              '55555555-5555-4555-8555-555555555555',
            dbQuery,
          });

        expect(
          result.events
        ).toHaveLength(1);

        expect(
          result.events[0]
            .correlation_id
        ).toBe(
          correlationId
        );

        expect(
          dbQuery
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );

    test(
      'returns empty result for unknown exact email',
      async () => {
        const dbQuery =
          jest.fn()
            .mockResolvedValue({
              rows: [],
            });

        const result =
          await searchSupportTimeline({
            type: 'email',
            value:
              'missing@example.com',
            dbQuery,
          });

        expect(
          result.events
        ).toEqual([]);

        expect(
          result.identities
        ).toEqual([]);

        expect(
          dbQuery
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
    test(
      'builds transaction case summary from safe events',
      () => {
        const summary =
          buildCaseSummary([
            {
              id: 'event-1',
              event_name:
                'transaction.initiated',
              subject_type:
                'transaction',
              subject_id:
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              correlation_id:
                'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              actor_user_id:
                'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              company_id:
                'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              attributes: {
                provider: 'mtn',
                transaction_type:
                  'cash_in',
                status:
                  'initiated',
              },
              occurred_at:
                '2026-09-14T09:00:00.000Z',
            },
            {
              id: 'event-2',
              event_name:
                'transaction.failed',
              subject_type:
                'transaction',
              subject_id:
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              correlation_id:
                'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              actor_user_id:
                'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              company_id:
                'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              attributes: {
                provider: 'mtn',
                transaction_type:
                  'cash_in',
                status:
                  'failed',
              },
              occurred_at:
                '2026-09-14T09:01:00.000Z',
            },
          ]);

        expect(summary).toEqual({
          event_count: 2,
          failed_count: 1,
          pending_confirmation_count:
            0,
          outcome: 'failed',
          provider: 'mtn',
          transaction_type:
            'cash_in',
          first_event_at:
            '2026-09-14T09:00:00.000Z',
          last_event_at:
            '2026-09-14T09:01:00.000Z',
          transaction_ids: [
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ],
          correlation_ids: [
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ],
          user_ids: [
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ],
          company_ids: [
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          ],
        });
      }
    );

    test(
      'uses the latest terminal transaction event as case outcome',
      () => {
        const summary =
          buildCaseSummary([
            {
              event_name:
                'transaction.failed',
              subject_type:
                'transaction',
              subject_id: 'tx-1',
              correlation_id:
                'corr-1',
              attributes: {
                provider:
                  'telecel',
                transaction_type:
                  'cash_out',
              },
              occurred_at:
                '2026-09-14T09:00:00.000Z',
            },
            {
              event_name:
                'transaction.completed',
              subject_type:
                'transaction',
              subject_id: 'tx-1',
              correlation_id:
                'corr-1',
              attributes: {
                provider:
                  'telecel',
                transaction_type:
                  'cash_out',
              },
              occurred_at:
                '2026-09-14T09:01:00.000Z',
            },
          ]);

        expect(
          summary.outcome
        ).toBe('completed');

        expect(
          summary.failed_count
        ).toBe(1);
      }
    );

    test(
      'latest pending confirmation remains the case outcome',
      () => {
        const summary =
          buildCaseSummary([
            {
              event_name:
                'transaction.completed',
              subject_type:
                'transaction',
              subject_id: 'tx-1',
              correlation_id:
                'corr-1',
              attributes: {
                provider:
                  'telecel',
                transaction_type:
                  'cash_out',
              },
              occurred_at:
                '2026-09-14T09:00:00.000Z',
            },
            {
              event_name:
                'transaction.pending_confirmation',
              subject_type:
                'transaction',
              subject_id: 'tx-1',
              correlation_id:
                'corr-1',
              attributes: {
                provider:
                  'telecel',
                transaction_type:
                  'cash_out',
              },
              occurred_at:
                '2026-09-14T09:01:00.000Z',
            },
          ]);

        expect(
          summary.outcome
        ).toBe(
          'pending_confirmation'
        );

        expect(
          summary
            .pending_confirmation_count
        ).toBe(1);
      }
    );

    test(
      'empty event list returns unknown case summary',
      () => {
        expect(
          buildCaseSummary([])
        ).toEqual({
          event_count: 0,
          failed_count: 0,
          pending_confirmation_count:
            0,
          outcome: 'unknown',
          provider: null,
          transaction_type: null,
          first_event_at: null,
          last_event_at: null,
          transaction_ids: [],
          correlation_ids: [],
          user_ids: [],
          company_ids: [],
        });
      }
    );


  }
);
