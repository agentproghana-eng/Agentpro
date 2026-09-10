'use strict';

const {
  WINDOW_SECONDS,
  startApiRequestTelemetry,
  stopApiRequestTelemetry,
  recordApiRequest,
  apiRequestSnapshot,
} = require(
  '../../src/services/apiRequestTelemetryService'
);

describe('API request telemetry service', () => {
  beforeEach(() => {
    stopApiRequestTelemetry();
  });

  afterEach(() => {
    stopApiRequestTelemetry();
  });

  test('does not collect while disabled', () => {
    recordApiRequest({
      statusCode: 200,
      durationMs: 20,
      nowMs: 1_000,
    });

    const snapshot = apiRequestSnapshot({
      nowMs: 1_000,
    });

    expect(snapshot.enabled).toBe(false);
    expect(snapshot.requests_total).toBe(0);
    expect(
      snapshot.requests_last_minute
    ).toBe(0);
  });

  test('counts response classes and server error rate', () => {
    startApiRequestTelemetry();

    const nowMs = 100_000;

    recordApiRequest({
      statusCode: 200,
      durationMs: 10,
      nowMs,
    });

    recordApiRequest({
      statusCode: 201,
      durationMs: 20,
      nowMs,
    });

    recordApiRequest({
      statusCode: 400,
      durationMs: 30,
      nowMs,
    });

    recordApiRequest({
      statusCode: 500,
      durationMs: 40,
      nowMs,
    });

    const snapshot = apiRequestSnapshot({
      nowMs,
    });

    expect(snapshot.requests_total).toBe(4);
    expect(
      snapshot.requests_last_minute
    ).toBe(4);

    expect(snapshot.responses).toEqual({
      status_2xx: 2,
      status_3xx: 0,
      status_4xx: 1,
      status_5xx: 1,
      aborted: 0,
    });

    expect(
      snapshot.server_error_rate
    ).toBe(0.25);
  });

  test('reports p50 p95 p99 and max latency', () => {
    startApiRequestTelemetry();

    const nowMs = 200_000;

    for (let duration = 1; duration <= 100; duration += 1) {
      recordApiRequest({
        statusCode: 200,
        durationMs: duration,
        nowMs,
      });
    }

    const snapshot = apiRequestSnapshot({
      nowMs,
    });

    expect(snapshot.latency.p50_ms).toBe(50);
    expect(snapshot.latency.p95_ms).toBe(95);
    expect(snapshot.latency.p99_ms).toBe(99);
    expect(snapshot.latency.max_ms).toBe(100);
  });

  test('expires requests outside rolling one minute window', () => {
    startApiRequestTelemetry();

    recordApiRequest({
      statusCode: 500,
      durationMs: 25,
      nowMs: 1_000,
    });

    recordApiRequest({
      statusCode: 200,
      durationMs: 10,
      nowMs: 61_000,
    });

    const snapshot = apiRequestSnapshot({
      nowMs: 61_000,
    });

    expect(WINDOW_SECONDS).toBe(60);
    expect(snapshot.requests_total).toBe(2);
    expect(
      snapshot.requests_last_minute
    ).toBe(1);

    expect(snapshot.responses.status_5xx).toBe(0);
    expect(snapshot.responses.status_2xx).toBe(1);
  });

  test('tracks aborted requests separately', () => {
    startApiRequestTelemetry();

    recordApiRequest({
      statusCode: 200,
      durationMs: 17,
      aborted: true,
      nowMs: 300_000,
    });

    const snapshot = apiRequestSnapshot({
      nowMs: 300_000,
    });

    expect(snapshot.responses.aborted).toBe(1);
    expect(snapshot.responses.status_2xx).toBe(0);
  });

  test('exposes aggregate operational data only', () => {
    startApiRequestTelemetry();

    recordApiRequest({
      statusCode: 200,
      durationMs: 10,
      nowMs: 400_000,
    });

    const serialized = JSON.stringify(
      apiRequestSnapshot({
        nowMs: 400_000,
      })
    ).toLowerCase();

    expect(serialized).not.toContain('path');
    expect(serialized).not.toContain('url');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('requestid');
    expect(serialized).not.toContain('authorization');
  });
});
