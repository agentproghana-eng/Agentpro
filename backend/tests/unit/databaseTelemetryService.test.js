'use strict';

const {
  WINDOW_SECONDS,
  SLOW_QUERY_THRESHOLD_MS,
  startDatabaseTelemetry,
  stopDatabaseTelemetry,
  recordDatabaseOperation,
  recordDatabaseTransaction,
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

  test('tracks bounded slow query fingerprints without SQL text', () => {
    startDatabaseTelemetry();

    recordDatabaseOperation({
      acquisitionMs: 5,
      executionMs:
        SLOW_QUERY_THRESHOLD_MS + 25,
      totalMs:
        SLOW_QUERY_THRESHOLD_MS + 30,
      queryFingerprint:
        'q_0123456789abcdef',
      queryLabel:
        'transactions.history',
      nowMs: 250_000,
    });

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs: 250_000,
      });

    expect(
      snapshot.slow_queries.count
    ).toBe(1);

    expect(
      snapshot
        .slow_queries
        .fingerprints
    ).toEqual([
      {
        fingerprint:
          'q_0123456789abcdef',
        label:
          'transactions.history',
        count: 1,
        failures: 0,
        max_execution_ms:
          SLOW_QUERY_THRESHOLD_MS + 25,
      },
    ]);

    const serialized =
      JSON.stringify(snapshot);

    expect(serialized)
      .not.toContain(
        'SELECT * FROM'
      );
  });

  test('tracks transaction acquisition and total duration separately', () => {
    startDatabaseTelemetry();

    recordDatabaseTransaction({
      acquisitionMs: 35,
      totalMs: 220,
      success: true,
      nowMs: 275_000,
    });

    const snapshot =
      databaseTelemetrySnapshot({
        nowMs: 275_000,
      });

    expect(
      snapshot.transactions.count
    ).toBe(1);

    expect(
      snapshot.transactions.failures
    ).toBe(0);

    expect(
      snapshot
        .transactions
        .acquisition_wait
        .p95_ms
    ).toBe(35);

    expect(
      snapshot
        .transactions
        .total
        .p95_ms
    ).toBe(220);
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

    expect(serialized).not.toContain('sql_text');
    expect(serialized).not.toContain('query_text');
    expect(serialized).not.toContain('params');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('token');
  });
});
