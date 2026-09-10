'use strict';

const {
  WINDOW_SECONDS,
  startAuthPaystackTelemetry,
  stopAuthPaystackTelemetry,
  recordLoginResponse,
  recordPaystackWebhookEvent,
  authTelemetrySnapshot,
  paystackWebhookTelemetrySnapshot,
} = require(
  '../../src/services/authPaystackTelemetryService'
);

describe('auth and Paystack telemetry service', () => {
  beforeEach(() => {
    stopAuthPaystackTelemetry();
  });

  afterEach(() => {
    stopAuthPaystackTelemetry();
  });

  test('does not collect while disabled', () => {
    recordLoginResponse({
      statusCode: 200,
      nowMs: 1_000,
    });

    recordPaystackWebhookEvent(
      'received',
      { nowMs: 1_000 }
    );

    expect(
      authTelemetrySnapshot({
        nowMs: 1_000,
      }).login_attempts
    ).toBe(0);

    expect(
      paystackWebhookTelemetrySnapshot({
        nowMs: 1_000,
      }).received
    ).toBe(0);
  });

  test('classifies login outcomes without identity data', () => {
    startAuthPaystackTelemetry();

    const nowMs = 10_000;

    for (const statusCode of [
      200,
      202,
      400,
      401,
      403,
      423,
      429,
      503,
      500,
      418,
    ]) {
      recordLoginResponse({
        statusCode,
        nowMs,
      });
    }

    const snapshot =
      authTelemetrySnapshot({
        nowMs,
      });

    expect(snapshot).toEqual({
      enabled: true,
      window_seconds: 60,
      login_attempts: 10,
      successes: 2,
      invalid_credentials: 1,
      invalid_requests: 1,
      locked: 1,
      forbidden: 1,
      rate_limited: 1,
      unavailable: 1,
      server_failures: 1,
      other_responses: 1,
      aborted: 0,
      success_rate: 0.2,
    });
  });

  test('expires auth activity outside rolling window', () => {
    startAuthPaystackTelemetry();

    recordLoginResponse({
      statusCode: 401,
      nowMs: 1_000,
    });

    recordLoginResponse({
      statusCode: 200,
      nowMs: 61_000,
    });

    const snapshot =
      authTelemetrySnapshot({
        nowMs: 61_000,
      });

    expect(WINDOW_SECONDS).toBe(60);
    expect(snapshot.login_attempts).toBe(1);
    expect(snapshot.successes).toBe(1);
    expect(
      snapshot.invalid_credentials
    ).toBe(0);
  });

  test('tracks Paystack webhook lifecycle', () => {
    startAuthPaystackTelemetry();

    const nowMs = 20_000;

    for (const event of [
      'received',
      'valid_signatures',
      'charge_success_events',
      'fulfillment_successes',
      'received',
      'valid_signatures',
      'charge_success_events',
      'fulfillment_failures',
      'received',
      'invalid_signatures',
      'received',
      'valid_signatures',
      'ignored_events',
    ]) {
      recordPaystackWebhookEvent(
        event,
        { nowMs }
      );
    }

    const snapshot =
      paystackWebhookTelemetrySnapshot({
        nowMs,
      });

    expect(snapshot).toEqual({
      enabled: true,
      window_seconds: 60,
      received: 4,
      valid_signatures: 3,
      invalid_signatures: 1,
      ignored_events: 1,
      charge_success_events: 2,
      fulfillment_successes: 1,
      fulfillment_failures: 1,
      fulfillment_failure_rate: 0.5,
    });
  });

  test('ignores unknown Paystack metric names', () => {
    startAuthPaystackTelemetry();

    recordPaystackWebhookEvent(
      'reference_APG_SECRET',
      { nowMs: 30_000 }
    );

    const snapshot =
      paystackWebhookTelemetrySnapshot({
        nowMs: 30_000,
      });

    expect(snapshot.received).toBe(0);
  });

  test('snapshots contain aggregate operational data only', () => {
    startAuthPaystackTelemetry();

    recordLoginResponse({
      statusCode: 401,
      nowMs: 40_000,
    });

    recordPaystackWebhookEvent(
      'received',
      { nowMs: 40_000 }
    );

    const serialized = JSON.stringify({
      auth: authTelemetrySnapshot({
        nowMs: 40_000,
      }),
      paystack:
        paystackWebhookTelemetrySnapshot({
          nowMs: 40_000,
        }),
    }).toLowerCase();

    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('reference');
    expect(serialized).not.toContain('requestid');
    expect(serialized).not.toContain('ip_address');
    expect(serialized).not.toContain('authorization');
  });


  test(
    'counts aborted login attempts without classifying them as successes',
    () => {
      startAuthPaystackTelemetry();

      recordLoginResponse({
        aborted: true,
        nowMs: 1000,
      });

      const snapshot =
        authTelemetrySnapshot({
          nowMs: 1000,
        });

      expect(
        snapshot.login_attempts
      ).toBe(1);

      expect(
        snapshot.aborted
      ).toBe(1);

      expect(
        snapshot.successes
      ).toBe(0);

      expect(
        snapshot.success_rate
      ).toBe(0);
    }
  );

  test(
    'completed login responses are not counted as aborted',
    () => {
      startAuthPaystackTelemetry();

      recordLoginResponse({
        statusCode: 200,
        aborted: false,
        nowMs: 1000,
      });

      const snapshot =
        authTelemetrySnapshot({
          nowMs: 1000,
        });

      expect(
        snapshot.login_attempts
      ).toBe(1);

      expect(
        snapshot.successes
      ).toBe(1);

      expect(
        snapshot.aborted
      ).toBe(0);
    }
  );

});
