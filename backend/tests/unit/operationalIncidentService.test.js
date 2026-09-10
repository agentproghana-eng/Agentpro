'use strict';

const mockClientQuery =
  jest.fn();

const mockWithTransaction =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    withTransaction:
      (...args) =>
        mockWithTransaction(
          ...args
        ),
  })
);

const {
  incidentKeyForAlert,
  normalizeAlert,
  reconcileOperationalIncidents,
} = require(
  '../../src/services/operationalIncidentService'
);

describe(
  'operational incident service',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockWithTransaction
        .mockImplementation(
          async (callback) =>
            callback({
              query:
                mockClientQuery,
            })
        );
    });

    test.each([
      [
        'api_5xx_rate_high',
        'api:5xx_rate',
      ],
      [
        'api_5xx_rate_critical',
        'api:5xx_rate',
      ],
      [
        'api_p95_latency_high',
        'api:p95_latency',
      ],
      [
        'api_p95_latency_critical',
        'api:p95_latency',
      ],
      [
        'paystack_fulfillment_degraded',
        'paystack:fulfillment',
      ],
      [
        'paystack_fulfillment_critical',
        'paystack:fulfillment',
      ],
      [
        'redis_unavailable',
        'redis:availability',
      ],
      [
        'outbox_backlog_high',
        'outbox:backlog',
      ],
      [
        'outbox_backlog_critical',
        'outbox:backlog',
      ],
      [
        'outbox_age_high',
        'outbox:oldest_pending_age',
      ],
      [
        'outbox_age_critical',
        'outbox:oldest_pending_age',
      ],
      [
        'postgres_pool_waiting',
        'postgres:pool_waiting',
      ],
      [
        'postgres_pool_wait_critical',
        'postgres:pool_waiting',
      ],
      [
        'provider_mtn_degraded',
        'provider:mtn',
      ],
      [
        'provider_mtn_major_outage',
        'provider:mtn',
      ],
      [
        'provider_telecel_degraded',
        'provider:telecel',
      ],
      [
        'provider_at_money_major_outage',
        'provider:at_money',
      ],
    ])(
      'maps %s to stable incident identity',
      (code, expected) => {
        expect(
          incidentKeyForAlert({
            code,
          })
        ).toBe(expected);
      }
    );

    test(
      'rejects unmapped alert codes',
      () => {
        expect(() =>
          normalizeAlert({
            code:
              'future_unknown_alert',
            component:
              'future',
            severity:
              'warning',
            observed: {},
            threshold: {},
          })
        ).toThrow(
          'no incident identity mapping'
        );
      }
    );

    test.each([
      {
        observed: {
          user_id:
            'private',
        },
      },
      {
        observed: {
          email:
            'private@example.com',
        },
      },
      {
        observed: {
          phone_number:
            '0000000000',
        },
      },
      {
        observed: {
          token:
            'secret',
        },
      },
      {
        observed: {
          transaction_reference:
            'secret',
        },
      },
      {
        observed: {
          sim_iccid:
            'secret',
        },
      },
      {
        observed: {
          ussd_session:
            'secret',
        },
      },
    ])(
      'rejects identity-bearing incident payload %#',
      (extra) => {
        expect(() =>
          normalizeAlert({
            code:
              'redis_unavailable',
            component:
              'redis',
            severity:
              'critical',
            observed:
              extra.observed,
            threshold: {
              required_status:
                'ready',
            },
          })
        ).toThrow(
          'forbidden identity data'
        );
      }
    );

    test(
      'reconciles active incidents with one transaction',
      async () => {
        const when =
          new Date(
            '2026-09-10T12:30:00.000Z'
          );

        mockClientQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: '1',
                incident_key:
                  'redis:availability',
                alert_code:
                  'redis_unavailable',
                component:
                  'redis',
                severity:
                  'critical',
                occurrence_count:
                  '1',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const result =
          await reconcileOperationalIncidents(
            {
              status:
                'critical',
              alerts: [
                {
                  code:
                    'redis_unavailable',
                  severity:
                    'critical',
                  component:
                    'redis',
                  observed: {
                    status:
                      'unavailable',
                  },
                  threshold: {
                    required_status:
                      'ready',
                  },
                  window: null,
                },
              ],
            },
            {
              observedAt: when,
            }
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(1);

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(2);

        const upsertSql =
          mockClientQuery
            .mock.calls[0][0];

        expect(upsertSql)
          .toContain(
            'ON CONFLICT (incident_key)'
          );

        expect(upsertSql)
          .toContain(
            'WHERE resolved_at IS NULL'
          );

        expect(upsertSql)
          .toContain(
            'occurrence_count + 1'
          );

        const resolveSql =
          mockClientQuery
            .mock.calls[1][0];

        expect(resolveSql)
          .toContain(
            'resolved_at IS NULL'
          );

        expect(resolveSql)
          .toContain(
            'ANY($2::varchar[])'
          );

        expect(
          result.active
        ).toHaveLength(1);

        expect(
          result.resolved
        ).toEqual([]);
      }
    );

    test(
      'resolves every active incident when evaluation is operational',
      async () => {
        mockClientQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: '9',
                incident_key:
                  'redis:availability',
                resolved_at:
                  new Date(),
              },
            ],
          });

        await reconcileOperationalIncidents(
          {
            status:
              'operational',
            alerts: [],
          },
          {
            observedAt:
              new Date(
                '2026-09-10T12:31:00.000Z'
              ),
          }
        );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(1);

        expect(
          mockClientQuery
            .mock.calls[0][0]
        ).toContain(
          'SET resolved_at = $1'
        );

        expect(
          mockClientQuery
            .mock.calls[0][0]
        ).not.toContain(
          'ANY($2::varchar[])'
        );
      }
    );

    test(
      'severity escalation keeps the same active incident identity',
      async () => {
        expect(
          incidentKeyForAlert({
            code:
              'outbox_backlog_high',
          })
        ).toBe(
          incidentKeyForAlert({
            code:
              'outbox_backlog_critical',
          })
        );

        expect(
          incidentKeyForAlert({
            code:
              'provider_telecel_degraded',
          })
        ).toBe(
          incidentKeyForAlert({
            code:
              'provider_telecel_major_outage',
          })
        );
      }
    );

    test(
      'rejects duplicate incident identities in one evaluation',
      async () => {
        await expect(
          reconcileOperationalIncidents({
            alerts: [
              {
                code:
                  'api_5xx_rate_high',
              },
              {
                code:
                  'api_5xx_rate_critical',
              },
            ],
          })
        ).rejects.toMatchObject({
          code:
            'OPERATIONAL_INCIDENT_DUPLICATE_KEY',
        });

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'does not send notifications or dispatch outbox events',
      () => {
        const source =
          require('fs')
            .readFileSync(
              require('path')
                .join(
                  __dirname,
                  '../../src/services/operationalIncidentService.js'
                ),
              'utf8'
            );

        expect(source)
          .not.toContain(
            'notificationService'
          );

        expect(source)
          .not.toContain(
            'enqueueOutboxEvent'
          );

        expect(source)
          .not.toContain(
            'dispatchOutboxEvent'
          );
      }
    );
  }
);
