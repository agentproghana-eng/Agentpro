'use strict';

const fs =
  require('fs');

const path =
  require('path');

const {
  normalizeSignal,
  persistFraudSignal,
  persistFraudSignals,
} = require(
  '../../src/services/fraudSignalService'
);

const USER_ID =
  '11111111-1111-4111-8111-111111111111';

const COMPANY_ID =
  '22222222-2222-4222-8222-222222222222';

function signal(
  overrides = {}
) {
  return {
    signal_type:
      'transaction_anomaly',

    rule_id:
      'transaction_velocity_5m',

    severity:
      'medium',

    risk_score: 45,

    subject_type:
      'user',

    subject_id:
      USER_ID,

    actor_user_id:
      USER_ID,

    company_id:
      COMPANY_ID,

    provider:
      'mtn',

    window_started_at:
      '2026-09-14T10:55:00.000Z',

    window_ended_at:
      '2026-09-14T11:00:00.000Z',

    observed_event_count: 30,

    metrics: {
      threshold: 30,
      observed: 30,
    },

    evidence: {
      event_ids: [
        'event-1',
      ],
      transaction_ids: [
        'transaction-1',
      ],
      correlation_ids: [
        '33333333-3333-4333-8333-333333333333',
      ],
    },

    dedupe_key:
      `fraud:transaction_velocity_5m:${USER_ID}:2026-09-14T11:00:00.000Z`,

    ...overrides,
  };
}

describe(
  'fraud signal persistence',
  () => {
    test(
      'migration creates durable reviewable fraud signals',
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../migrations/126_fraud_signals.sql'
            ),
            'utf8'
          );

        expect(
          migration
        ).toContain(
          'CREATE TABLE fraud_signals'
        );

        expect(
          migration
        ).toContain(
          'UNIQUE (dedupe_key)'
        );

        expect(
          migration
        ).toContain(
          "review_status VARCHAR(20) NOT NULL DEFAULT 'open'"
        );

        expect(
          migration
        ).toContain(
          "review_status IN ("
        );

        expect(
          migration
        ).toContain(
          "WHERE review_status = 'open'"
        );
      }
    );

    test(
      'normalizes a valid non-enforcing signal',
      () => {
        const normalized =
          normalizeSignal(
            signal()
          );

        expect(
          normalized.ruleId
        ).toBe(
          'transaction_velocity_5m'
        );

        expect(
          normalized.riskScore
        ).toBe(45);

        expect(
          JSON.parse(
            normalized.evidence
          )
        ).toEqual({
          event_ids: [
            'event-1',
          ],
          transaction_ids: [
            'transaction-1',
          ],
          correlation_ids: [
            '33333333-3333-4333-8333-333333333333',
          ],
        });
      }
    );

    test(
      'rejects enforcement actions',
      () => {
        expect(
          () =>
            normalizeSignal(
              signal({
                enforcement_action:
                  'block',
              })
            )
        ).toThrow(
          'Fraud signal persistence cannot apply enforcement'
        );
      }
    );

    test(
      'rejects unsupported evidence keys',
      () => {
        expect(
          () =>
            normalizeSignal(
              signal({
                evidence: {
                  event_ids: [],
                  transaction_ids: [],
                  correlation_ids: [],
                  raw_response: [
                    'secret',
                  ],
                },
              })
            )
        ).toThrow(
          'Unsupported evidence key'
        );
      }
    );

    test(
      'rejects excessive evidence identifiers',
      () => {
        expect(
          () =>
            normalizeSignal(
              signal({
                evidence: {
                  event_ids:
                    Array.from(
                      { length: 21 },
                      (_, index) =>
                        `event-${index}`
                    ),
                  transaction_ids: [],
                  correlation_ids: [],
                },
              })
            )
        ).toThrow(
          'event_ids is invalid'
        );
      }
    );

    test(
      'requires transaction client',
      async () => {
        await expect(
          persistFraudSignal({
            dbClient: null,
            signal:
              signal(),
          })
        ).rejects.toThrow(
          'requires a database transaction client'
        );
      }
    );

    test(
      'creates a new fraud signal',
      async () => {
        const row = {
          id:
            '44444444-4444-4444-8444-444444444444',
          dedupe_key:
            signal().dedupe_key,
          review_status:
            'open',
        };

        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [row],
              }),
        };

        const result =
          await persistFraudSignal({
            dbClient,
            signal:
              signal(),
          });

        expect(
          result.created
        ).toBe(true);

        expect(
          result.signal
        ).toEqual(row);

        expect(
          dbClient.query
        ).toHaveBeenCalledTimes(1);

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toContain(
          'ON CONFLICT (dedupe_key)'
        );
      }
    );

    test(
      'resolves an existing deduplicated signal',
      async () => {
        const row = {
          id:
            '55555555-5555-4555-8555-555555555555',
          dedupe_key:
            signal().dedupe_key,
          review_status:
            'open',
        };

        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [],
              })
              .mockResolvedValueOnce({
                rows: [row],
              }),
        };

        const result =
          await persistFraudSignal({
            dbClient,
            signal:
              signal(),
          });

        expect(
          result.created
        ).toBe(false);

        expect(
          result.signal
        ).toEqual(row);

        expect(
          dbClient.query
        ).toHaveBeenCalledTimes(2);
      }
    );

    test(
      'persists an evaluation without enforcement',
      async () => {
        const first =
          signal();

        const second =
          signal({
            rule_id:
              'transaction_failure_burst_10m',
            severity:
              'high',
            risk_score: 70,
            dedupe_key:
              `fraud:transaction_failure_burst_10m:${USER_ID}:2026-09-14T11:00:00.000Z`,
          });

        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [{
                  id: 'signal-1',
                }],
              })
              .mockResolvedValueOnce({
                rows: [{
                  id: 'signal-2',
                }],
              }),
        };

        const result =
          await persistFraudSignals({
            dbClient,
            evaluation: {
              enforcement_action:
                'none',
              signals: [
                first,
                second,
              ],
            },
          });

        expect(
          result.signal_count
        ).toBe(2);

        expect(
          result.created_count
        ).toBe(2);

        expect(
          result.existing_count
        ).toBe(0);
      }
    );

    test(
      'rejects enforcing evaluation',
      async () => {
        await expect(
          persistFraudSignals({
            dbClient: {
              query:
                jest.fn(),
            },
            evaluation: {
              enforcement_action:
                'block',
              signals: [],
            },
          })
        ).rejects.toThrow(
          'Only non-enforcing fraud evaluations may be persisted'
        );
      }
    );
  }
);
