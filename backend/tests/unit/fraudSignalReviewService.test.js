'use strict';

const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeQueueFilters,
  listFraudSignals,
  getFraudSignal,
  reviewFraudSignal,
} = require(
  '../../src/services/fraudSignalReviewService'
);

const SIGNAL_ID =
  '11111111-1111-4111-8111-111111111111';

const REVIEWER_ID =
  '22222222-2222-4222-8222-222222222222';

describe(
  'fraud signal review service',
  () => {
    test(
      'defaults to the open bounded queue',
      () => {
        expect(
          normalizeQueueFilters()
        ).toEqual({
          status: 'open',
          severity: 'all',
          limit:
            DEFAULT_LIMIT,
        });
      }
    );

    test(
      'rejects limits above the hard maximum',
      () => {
        expect(() =>
          normalizeQueueFilters({
            limit:
              MAX_LIMIT + 1,
          })
        ).toThrow(
          'limit must be between'
        );
      }
    );

    test(
      'lists only requested status and severity with a hard limit',
      async () => {
        const dbQuery =
          jest.fn()
            .mockResolvedValue({
              rows: [
                {
                  id:
                    SIGNAL_ID,
                },
              ],
            });

        const result =
          await listFraudSignals({
            status: 'open',
            severity: 'high',
            limit: 25,
            dbQuery,
          });

        expect(
          result.count
        ).toBe(1);

        expect(
          result.truncated
        ).toBe(false);

        const [
          sql,
          params,
        ] =
          dbQuery.mock
            .calls[0];

        expect(sql).toContain(
          'review_status = $1'
        );

        expect(sql).toContain(
          'severity = $2'
        );

        expect(sql).toContain(
          'risk_score DESC'
        );

        expect(params).toEqual([
          'open',
          'high',
          25,
        ]);
      }
    );

    test(
      'returns signal detail by uuid',
      async () => {
        const dbQuery =
          jest.fn()
            .mockResolvedValue({
              rows: [
                {
                  id:
                    SIGNAL_ID,
                  review_status:
                    'open',
                },
              ],
            });

        const result =
          await getFraudSignal({
            id:
              SIGNAL_ID,
            dbQuery,
          });

        expect(result.id)
          .toBe(
            SIGNAL_ID
          );
      }
    );

    test(
      'returns 404 for missing signal',
      async () => {
        const dbQuery =
          jest.fn()
            .mockResolvedValue({
              rows: [],
            });

        await expect(
          getFraudSignal({
            id:
              SIGNAL_ID,
            dbQuery,
          })
        ).rejects
          .toMatchObject({
            statusCode: 404,
            code:
              'FRAUD_SIGNAL_NOT_FOUND',
          });
      }
    );

    test(
      'reviews an open signal exactly once',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [
                  {
                    id:
                      SIGNAL_ID,
                    review_status:
                      'open',
                  },
                ],
              })
              .mockResolvedValueOnce({
                rows: [
                  {
                    id:
                      SIGNAL_ID,
                    review_status:
                      'escalated',
                    reviewed_by:
                      REVIEWER_ID,
                  },
                ],
              }),
        };

        const result =
          await reviewFraudSignal({
            dbClient,
            id:
              SIGNAL_ID,
            status:
              'escalated',
            reviewedBy:
              REVIEWER_ID,
          });

        expect(
          result.previous
            .review_status
        ).toBe('open');

        expect(
          result.signal
            .review_status
        ).toBe(
          'escalated'
        );

        expect(
          dbClient.query
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toContain(
          'FOR UPDATE'
        );

        expect(
          dbClient.query
            .mock.calls[1][0]
        ).toContain(
          "review_status = 'open'"
        );
      }
    );

    test(
      'rejects reopening or replacing a completed review',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    id:
                      SIGNAL_ID,
                    review_status:
                      'reviewed',
                  },
                ],
              }),
        };

        await expect(
          reviewFraudSignal({
            dbClient,
            id:
              SIGNAL_ID,
            status:
              'dismissed',
            reviewedBy:
              REVIEWER_ID,
          })
        ).rejects
          .toMatchObject({
            statusCode: 409,
            code:
              'FRAUD_SIGNAL_ALREADY_REVIEWED',
          });
      }
    );

    test(
      'rejects open as a review action',
      async () => {
        const dbClient = {
          query:
            jest.fn(),
        };

        await expect(
          reviewFraudSignal({
            dbClient,
            id:
              SIGNAL_ID,
            status: 'open',
            reviewedBy:
              REVIEWER_ID,
          })
        ).rejects
          .toMatchObject({
            statusCode: 400,
            code:
              'FRAUD_SIGNAL_INVALID_REVIEW_STATUS',
          });

        expect(
          dbClient.query
        ).not
          .toHaveBeenCalled();
      }
    );
  }
);
