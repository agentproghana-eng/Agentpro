'use strict';

const {
  API_MIN_REQUESTS,
  API_MIN_LATENCY_SAMPLES,
  evaluateOperationalAlerts,
} = require(
  '../../src/services/operationalAlertService'
);

function healthySnapshot() {
  return {
    api: {
      enabled: true,
      window_seconds: 60,
      requests_last_minute: 200,
      server_error_rate: 0,
      responses: {
        status_5xx: 0,
      },
      latency: {
        sample_count: 200,
        p95_ms: 100,
      },
    },

    paystack_webhooks: {
      enabled: true,
      window_seconds: 60,
      fulfillment_successes: 10,
      fulfillment_failures: 0,
      fulfillment_failure_rate: 0,
    },

    postgres: {
      total_connections: 4,
      idle_connections: 2,
      waiting_requests: 0,
    },

    redis: {
      status: 'ready',
      ping_ms: 2,
    },

    outbox: {
      pending: 0,
      processing: 0,
      dead_letter: 0,
      oldest_pending_age_seconds: 0,
    },

    provider_health: {
      window_minutes: 10,
      minimum_terminal_transactions: 20,
      providers: {
        mtn: {
          status: 'operational',
          window_minutes: 10,
          terminal_transactions: 100,
          success: 100,
          failed: 0,
          pending_confirmation: 0,
          failure_rate: 0,
        },
        telecel: {
          status: 'operational',
          window_minutes: 10,
          terminal_transactions: 100,
          success: 100,
          failed: 0,
          pending_confirmation: 0,
          failure_rate: 0,
        },
        at_money: {
          status: 'operational',
          window_minutes: 10,
          terminal_transactions: 100,
          success: 100,
          failed: 0,
          pending_confirmation: 0,
          failure_rate: 0,
        },
      },
    },
  };
}

describe(
  'operational alert evaluation',
  () => {
    test(
      'returns operational when all signals are healthy',
      () => {
        const result =
          evaluateOperationalAlerts(
            healthySnapshot()
          );

        expect(result).toEqual({
          status: 'operational',
          counts: {
            critical: 0,
            warning: 0,
            total: 0,
          },
          alerts: [],
        });
      }
    );

    test(
      'uses provider health sustained window instead of single transaction failures',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.provider_health
          .providers.telecel = {
          status: 'degraded',
          window_minutes: 10,
          terminal_transactions: 25,
          success: 20,
          failed: 5,
          pending_confirmation: 2,
          failure_rate: 0.2,
        };

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(result.status)
          .toBe('warning');

        expect(result.alerts)
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  'provider_telecel_degraded',
                severity: 'warning',
                component:
                  'provider:telecel',
                window: {
                  minutes: 10,
                },
              }),
            ])
          );
      }
    );

    test(
      'marks provider major outage critical',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.provider_health
          .providers.mtn.status =
            'major_outage';

        snapshot.provider_health
          .providers.mtn.failure_rate =
            0.6;

        snapshot.provider_health
          .providers.mtn.failed = 60;

        snapshot.provider_health
          .providers.mtn.success = 40;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
                'provider_mtn_major_outage' &&
              item.severity ===
                'critical'
          )
        ).toBe(true);
      }
    );

    test(
      'does not alert on API error rate below minimum sample size',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.api
          .requests_last_minute = 10;

        snapshot.api
          .server_error_rate = 0.5;

        snapshot.api.responses
          .status_5xx = 5;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code.startsWith(
                'api_5xx'
              )
          )
        ).toBe(false);
      }
    );

    test(
      'raises API server error warning and critical thresholds',
      () => {
        const warning =
          healthySnapshot();

        warning.api
          .server_error_rate = 0.08;

        warning.api.responses
          .status_5xx = 16;

        expect(
          evaluateOperationalAlerts(
            warning
          ).alerts.some(
            (item) =>
              item.code ===
              'api_5xx_rate_high'
          )
        ).toBe(true);

        const critical =
          healthySnapshot();

        critical.api
          .server_error_rate = 0.2;

        critical.api.responses
          .status_5xx = 40;

        expect(
          evaluateOperationalAlerts(
            critical
          ).alerts.some(
            (item) =>
              item.code ===
                'api_5xx_rate_critical' &&
              item.severity ===
                'critical'
          )
        ).toBe(true);
      }
    );

    test(
      'raises p95 latency only with enough samples',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.api.latency
          .sample_count = 150;

        snapshot.api.latency
          .p95_ms = 1500;

        expect(
          evaluateOperationalAlerts(
            snapshot
          ).alerts.some(
            (item) =>
              item.code ===
              'api_p95_latency_high'
          )
        ).toBe(true);
      }
    );

    test(
      'requires multiple Paystack fulfillment attempts',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.paystack_webhooks
          .fulfillment_successes = 0;

        snapshot.paystack_webhooks
          .fulfillment_failures = 1;

        snapshot.paystack_webhooks
          .fulfillment_failure_rate = 1;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.component ===
              'paystack'
          )
        ).toBe(false);
      }
    );

    test(
      'raises Paystack degradation after minimum sample gate',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.paystack_webhooks
          .fulfillment_successes = 4;

        snapshot.paystack_webhooks
          .fulfillment_failures = 2;

        snapshot.paystack_webhooks
          .fulfillment_failure_rate =
            0.3333;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
              'paystack_fulfillment_degraded'
          )
        ).toBe(true);
      }
    );

    test(
      'Redis non-ready is immediately critical',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.redis = {
          status: 'reconnecting',
          ping_ms: null,
        };

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
                'redis_unavailable' &&
              item.severity ===
                'critical'
          )
        ).toBe(true);
      }
    );

    test(
      'dead letter events are immediately critical',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.outbox
          .dead_letter = 1;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
                'outbox_dead_letter_present' &&
              item.severity ===
                'critical'
          )
        ).toBe(true);
      }
    );

    test(
      'detects outbox backlog and age',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.outbox.pending = 150;
        snapshot.outbox
          .oldest_pending_age_seconds =
            400;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.map(
            (item) => item.code
          )
        ).toEqual(
          expect.arrayContaining([
            'outbox_backlog_high',
            'outbox_age_high',
          ])
        );
      }
    );

    test(
      'detects PostgreSQL pool waiting requests',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.postgres
          .waiting_requests = 2;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
              'postgres_pool_waiting'
          )
        ).toBe(true);
      }
    );

    test(
      'critical alerts determine overall status',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.redis.status =
          'error';

        snapshot.outbox.pending =
          200;

        const result =
          evaluateOperationalAlerts(
            snapshot
          );

        expect(result.status)
          .toBe('critical');

        expect(
          result.counts.critical
        ).toBeGreaterThan(0);

        expect(
          result.counts.warning
        ).toBeGreaterThan(0);
      }
    );

    test(
      'alert payload contains no user or transaction identity fields',
      () => {
        const snapshot =
          healthySnapshot();

        snapshot.redis.status =
          'error';

        const serialized =
          JSON.stringify(
            evaluateOperationalAlerts(
              snapshot
            )
          ).toLowerCase();

        for (const forbidden of [
          'phone',
          'email',
          'reference',
          'amount',
          'iccid',
          'sim_slot',
          'user_id',
          'company_id',
          'request_id',
          'access_token',
          'refresh_token',
          'ussd_session_log',
        ]) {
          expect(serialized)
            .not
            .toContain(forbidden);
        }
      }
    );
  }
);

describe(
  'launch traffic alert baselines',
  () => {
    test(
      'API alert evaluation starts at twenty requests per minute',
      () => {
        expect(
          API_MIN_REQUESTS
        ).toBe(20);
      }
    );

    test(
      'API latency alert evaluation starts at twenty samples per minute',
      () => {
        expect(
          API_MIN_LATENCY_SAMPLES
        ).toBe(20);
      }
    );

    test(
      'does not alert below the launch request sample floor',
      () => {
        const result =
          evaluateOperationalAlerts({
            api: {
              enabled: true,
              requests_last_minute: 19,
              server_error_rate: 1,
              responses: {
                status_5xx: 19,
              },
              latency: {
                sample_count: 0,
                p95_ms: null,
              },
              window_seconds: 60,
            },
          });

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
                'api_5xx_rate_high' ||
              item.code ===
                'api_5xx_rate_critical'
          )
        ).toBe(false);
      }
    );

    test(
      'evaluates API error rate once twenty requests are observed',
      () => {
        const result =
          evaluateOperationalAlerts({
            api: {
              enabled: true,
              requests_last_minute: 20,
              server_error_rate: 0.05,
              responses: {
                status_5xx: 1,
              },
              latency: {
                sample_count: 0,
                p95_ms: null,
              },
              window_seconds: 60,
            },
          });

        expect(
          result.alerts
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'api_5xx_rate_high',
              severity:
                'warning',
            }),
          ])
        );
      }
    );

    test(
      'does not alert below the launch latency sample floor',
      () => {
        const result =
          evaluateOperationalAlerts({
            api: {
              enabled: true,
              requests_last_minute: 0,
              server_error_rate: 0,
              responses: {
                status_5xx: 0,
              },
              latency: {
                sample_count: 19,
                p95_ms: 5000,
              },
              window_seconds: 60,
            },
          });

        expect(
          result.alerts.some(
            (item) =>
              item.code ===
                'api_p95_latency_high' ||
              item.code ===
                'api_p95_latency_critical'
          )
        ).toBe(false);
      }
    );

    test(
      'evaluates latency once twenty samples are observed',
      () => {
        const result =
          evaluateOperationalAlerts({
            api: {
              enabled: true,
              requests_last_minute: 0,
              server_error_rate: 0,
              responses: {
                status_5xx: 0,
              },
              latency: {
                sample_count: 20,
                p95_ms: 1000,
              },
              window_seconds: 60,
            },
          });

        expect(
          result.alerts
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'api_p95_latency_high',
              severity:
                'warning',
            }),
          ])
        );
      }
    );
  }
);
