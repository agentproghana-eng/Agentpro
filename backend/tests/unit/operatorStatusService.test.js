'use strict';

const {
  buildOperatorStatus,
} = require(
  '../../src/services/operatorStatusService'
);

describe(
  'operator status service',
  () => {
    test(
      'returns sanitized provider and platform health',
      () => {
        const result =
          buildOperatorStatus({
            timestamp:
              '2026-09-14T08:00:00.000Z',

            provider_health: {
              providers: {
                mtn: {
                  status: 'degraded',
                  window_minutes: 10,
                  terminal_transactions: 40,
                  success: 34,
                  failed: 6,
                  pending_confirmation: 2,
                  failure_rate: 0.15,
                },
                telecel: {
                  status: 'operational',
                  window_minutes: 10,
                  terminal_transactions: 50,
                  success: 50,
                  failed: 0,
                  pending_confirmation: 0,
                  failure_rate: 0,
                },
                at_money: {
                  status: 'unknown',
                  window_minutes: 10,
                  terminal_transactions: 3,
                  success: 3,
                  failed: 0,
                  pending_confirmation: 0,
                  failure_rate: 0,
                },
              },
            },

            postgres: {
              waiting_requests: 0,
            },

            redis: {
              status: 'ready',
            },

            paystack_webhooks: {
              enabled: true,
            },

            operational_alerts: [
              {
                code:
                  'provider_mtn_degraded',
                severity: 'warning',
                component:
                  'provider:mtn',
                message:
                  'mtn transaction health is degraded.',
              },
            ],
          });

        expect(result.providers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: 'mtn',
              label: 'MTN',
              status: 'degraded',
              failure_rate: 0.15,
            }),
            expect.objectContaining({
              key: 'telecel',
              label: 'Telecel',
              status: 'operational',
            }),
            expect.objectContaining({
              key: 'at_money',
              label: 'AT',
              status: 'unknown',
            }),
          ])
        );

        expect(
          result.platform.redis.status
        ).toBe('operational');

        expect(
          result.platform.postgres.status
        ).toBe('operational');

        expect(
          result.alerts
        ).toHaveLength(1);

        expect(
          result.alerts[0]
        ).not.toHaveProperty(
          'observed'
        );
      }
    );

    test(
      'maps critical component alerts to major outage',
      () => {
        const result =
          buildOperatorStatus({
            redis: {
              status: 'ready',
            },
            paystack_webhooks: {
              enabled: true,
            },
            operational_alerts: [
              {
                code:
                  'api_5xx_rate_critical',
                severity: 'critical',
                component: 'api',
                message:
                  'API error rate elevated.',
              },
              {
                code:
                  'paystack_fulfillment_critical',
                severity: 'critical',
                component:
                  'paystack',
                message:
                  'Paystack failure rate elevated.',
              },
            ],
          });

        expect(
          result.platform.api.status
        ).toBe('major_outage');

        expect(
          result.platform.paystack.status
        ).toBe('major_outage');
      }
    );

    test(
      'does not report disabled telemetry as operational',
      () => {
        const result =
          buildOperatorStatus({
            api: {
              enabled: false,
            },
            paystack_webhooks: {
              enabled: false,
            },
            redis: {
              status: 'ready',
            },
            operational_alerts: [],
          });

        expect(
          result.platform.api.status
        ).toBe('unknown');

        expect(
          result.platform.api.telemetry_enabled
        ).toBe(false);

        expect(
          result.platform.paystack.status
        ).toBe('unknown');

        expect(
          result.platform.paystack.telemetry_enabled
        ).toBe(false);
      }
    );

    test(
      'marks unavailable redis as degraded',
      () => {
        const result =
          buildOperatorStatus({
            redis: {
              status: 'reconnecting',
            },
            operational_alerts: [],
          });

        expect(
          result.platform.redis.status
        ).toBe('degraded');
      }
    );
  }
);
