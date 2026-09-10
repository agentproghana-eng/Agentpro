'use strict';

const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  PROVIDERS,
  providerHealthFromRow,
  providerHealthSnapshot,
} = require('../../src/services/providerHealthService');

describe('provider health telemetry', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({
      rows: [],
    });
  });

  test('tracks only canonical telecom providers', () => {
    expect(PROVIDERS).toEqual([
      'mtn',
      'telecel',
      'at_money',
    ]);
  });

  test('keeps low-volume providers unknown', () => {
    const health = providerHealthFromRow(
      'telecel',
      {
        observed_transactions: 10,
        success: 7,
        failed: 3,
        pending_confirmation: 0,
      },
      10,
    );

    expect(health.status).toBe('unknown');
    expect(health.failure_rate).toBe(0.3);
    expect(health.terminal_transactions).toBe(10);
  });

  test('marks provider operational below ten percent failures', () => {
    const health = providerHealthFromRow(
      'mtn',
      {
        observed_transactions: 100,
        success: 95,
        failed: 5,
        pending_confirmation: 0,
      },
      10,
    );

    expect(health.status).toBe('operational');
    expect(health.failure_rate).toBe(0.05);
  });

  test('marks provider degraded from ten percent failures', () => {
    const health = providerHealthFromRow(
      'telecel',
      {
        observed_transactions: 100,
        success: 72,
        failed: 28,
        pending_confirmation: 0,
      },
      10,
    );

    expect(health.status).toBe('degraded');
    expect(health.failure_rate).toBe(0.28);
  });

  test('marks provider major outage at fifty percent failures', () => {
    const health = providerHealthFromRow(
      'at_money',
      {
        observed_transactions: 40,
        success: 20,
        failed: 20,
        pending_confirmation: 0,
      },
      10,
    );

    expect(health.status).toBe('major_outage');
    expect(health.failure_rate).toBe(0.5);
  });

  test('does not count pending confirmation as confirmed failure', () => {
    const health = providerHealthFromRow(
      'mtn',
      {
        observed_transactions: 30,
        success: 19,
        failed: 1,
        pending_confirmation: 10,
      },
      10,
    );

    expect(health.terminal_transactions).toBe(20);
    expect(health.failure_rate).toBe(0.05);
    expect(health.pending_confirmation).toBe(10);
    expect(health.status).toBe('operational');
  });

  test('returns every provider even when there is no traffic', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
    });

    const snapshot =
      await providerHealthSnapshot();

    expect(snapshot.providers.mtn.status).toBe(
      'unknown',
    );
    expect(snapshot.providers.telecel.status).toBe(
      'unknown',
    );
    expect(snapshot.providers.at_money.status).toBe(
      'unknown',
    );

    expect(
      snapshot.providers.mtn.failure_rate,
    ).toBeNull();
  });

  test('aggregates database results into provider health', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider: 'telecel',
          observed_transactions: 102,
          success: 72,
          failed: 28,
          pending_confirmation: 2,
        },
      ],
    });

    const snapshot =
      await providerHealthSnapshot();

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(
      mockQuery.mock.calls[0][1],
    ).toEqual([
      10,
      ['mtn', 'telecel', 'at_money'],
    ]);

    const sql = mockQuery.mock.calls[0][0];

    expect(sql).toContain(
      "status IN ('success', 'failed')"
    );
    expect(sql).toContain(
      'completed_at >='
    );
    expect(sql).toContain(
      "status = 'pending_confirmation'"
    );
    expect(sql).toContain(
      'created_at >='
    );

    expect(snapshot.providers.telecel).toEqual({
      provider: 'telecel',
      status: 'degraded',
      window_minutes: 10,
      observed_transactions: 102,
      terminal_transactions: 100,
      success: 72,
      failed: 28,
      pending_confirmation: 2,
      failure_rate: 0.28,
    });
  });

  test('rejects unsafe telemetry windows', async () => {
    await expect(
      providerHealthSnapshot({
        windowMinutes: 0,
      }),
    ).rejects.toThrow(
      'Provider health window must be an integer between 1 and 60 minutes',
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('snapshot contains operational aggregates only', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider: 'mtn',
          observed_transactions: 20,
          success: 19,
          failed: 1,
          pending_confirmation: 0,
        },
      ],
    });

    const snapshot =
      await providerHealthSnapshot();

    const serialized =
      JSON.stringify(snapshot).toLowerCase();

    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('reference');
    expect(serialized).not.toContain('amount');
    expect(serialized).not.toContain('userid');
    expect(serialized).not.toContain('agentid');
  });
});

describe('provider health query contract', () => {
  test('terminal outcomes use completion time while pending outcomes use creation time', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
    });

    await providerHealthSnapshot();

    const sql = mockQuery.mock.calls[0][0];

    expect(
      (sql.match(/completed_at >=/g) || []).length
    ).toBe(2);

    expect(
      (sql.match(/created_at >=/g) || []).length
    ).toBe(2);

    expect(sql).not.toContain(
      'COALESCE(completed_at, created_at)'
    );
  });
});
