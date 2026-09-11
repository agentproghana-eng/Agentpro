'use strict';

const {
  WINDOW_SECONDS,
  startDatabaseTelemetry,
  stopDatabaseTelemetry,
  recordDatabaseOperation,
  databaseTelemetrySnapshot,
} = require(
  '../../src/services/databaseTelemetryService'
);

describe('database telemetry service', () => {
  beforeEach(() => {
    stopDatabaseTelemetry();
  });

  afterEach(() => {
    stopDatabaseTelemetry();
  });

  test('does not collect while disabled', () => {
    recordDatabaseOperation({
      acquisitionMs: 10,
      executionMs: 20,
      totalMs: 30,
      nowMs: 1_000,
    });

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs: 1_000,
      });

    expect(snapshot.enabled).toBe(false);
    expect(snapshot.operations).toBe(0);
    expect(
      snapshot.acquisition_wait.sample_count
    ).toBe(0);
  });

  test('reports acquisition execution and total percentiles', () => {
    startDatabaseTelemetry();

    const nowMs = 100_000;

    for (
      let value = 1;
      value <= 100;
      value += 1
    ) {
      recordDatabaseOperation({
        acquisitionMs: value,
        executionMs: value * 2,
        totalMs: value * 3,
        nowMs,
      });
    }

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs,
      });

    expect(snapshot.operations).toBe(100);
    expect(snapshot.failures).toBe(0);

    expect(
      snapshot.acquisition_wait.p50_ms
    ).toBe(50);

    expect(
      snapshot.acquisition_wait.p95_ms
    ).toBe(95);

    expect(
      snapshot.acquisition_wait.p99_ms
    ).toBe(99);

    expect(
      snapshot.acquisition_wait.max_ms
    ).toBe(100);

    expect(
      snapshot.execution.p99_ms
    ).toBe(198);

    expect(
      snapshot.total.p99_ms
    ).toBe(297);
  });

  test('tracks failures without requiring execution timing', () => {
    startDatabaseTelemetry();

    recordDatabaseOperation({
      acquisitionMs: 250,
      executionMs: null,
      totalMs: 250,
      success: false,
      nowMs: 200_000,
    });

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs: 200_000,
      });

    expect(snapshot.operations).toBe(1);
    expect(snapshot.failures).toBe(1);

    expect(
      snapshot.acquisition_wait.sample_count
    ).toBe(1);

    expect(
      snapshot.execution.sample_count
    ).toBe(0);

    expect(
      snapshot.total.sample_count
    ).toBe(1);
  });

  test('expires samples outside rolling window', () => {
    startDatabaseTelemetry();

    recordDatabaseOperation({
      acquisitionMs: 100,
      executionMs: 10,
      totalMs: 110,
      nowMs: 1_000,
    });

    recordDatabaseOperation({
      acquisitionMs: 5,
      executionMs: 5,
      totalMs: 10,
      nowMs: 61_000,
    });

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs: 61_000,
      });

    expect(WINDOW_SECONDS).toBe(60);
    expect(snapshot.operations).toBe(1);

    expect(
      snapshot.acquisition_wait.max_ms
    ).toBe(5);
  });

  test('exposes aggregate operational data only', () => {
    startDatabaseTelemetry();

    recordDatabaseOperation({
      acquisitionMs: 10,
      executionMs: 20,
      totalMs: 30,
      nowMs: 300_000,
    });

    const serialized =
      JSON.stringify(
        databaseTelemetrySnapshot({
          nowMs: 300_000,
        })
      ).toLowerCase();

    expect(serialized).not.toContain('sql');
    expect(serialized).not.toContain('query');
    expect(serialized).not.toContain('text');
    expect(serialized).not.toContain('params');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('token');
  });
});
