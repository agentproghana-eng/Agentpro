const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  getCommissionTotals,
} = require('../../src/services/commissionService');

describe('commissionService exact totals', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('aggregates monetary totals directly in PostgreSQL', async () => {
    const exactRow = {
      transaction_count: '9007199254740993',
      total_gross: '123456789012345.67',
      total_provider_share: '37037036703703.70',
      total_net: '86419752308641.97',
    };

    mockQuery.mockResolvedValueOnce({
      rows: [
        exactRow,
      ],
    });

    const result =
      await getCommissionTotals({
        company_id: 'company-1',
        from_date:
          '2026-08-01T00:00:00.000Z',
        to_date:
          '2026-08-12T23:59:59.999Z',
      });

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'COUNT(*) AS transaction_count'
    );

    expect(sql).toContain(
      'SUM(c.gross_commission)'
    );

    expect(sql).toContain(
      'SUM(c.provider_share)'
    );

    expect(sql).toContain(
      'SUM(c.net_commission)'
    );

    expect(sql).not.toContain(
      'GROUP BY'
    );

    expect(params).toEqual([
      'company-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);

    // PostgreSQL NUMERIC/BIGINT values are intentionally returned
    // unchanged instead of passing through JS parseFloat/Number.
    expect(result).toBe(exactRow);
    expect(result.total_gross)
      .toBe('123456789012345.67');
    expect(result.transaction_count)
      .toBe('9007199254740993');
  });

  test('reuses manager, explicit branch, provider and date filters', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        transaction_count: '0',
        total_gross: '0',
        total_provider_share: '0',
        total_net: '0',
      }],
    });

    await getCommissionTotals({
      company_id: 'company-1',
      manager_id: 'manager-1',
      branch_id: 'branch-requested',
      agent_id: 'agent-1',
      provider: 'mtn,telecel,mtn',
      from_date:
        '2026-08-01T00:00:00.000Z',
      to_date:
        '2026-08-12T23:59:59.999Z',
    });

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'c.company_id = $1'
    );

    expect(sql).toContain(
      'FROM branch_managers'
    );

    expect(sql).toContain(
      'WHERE manager_id = $2'
    );

    expect(sql).toContain(
      'c.branch_id = $3'
    );

    expect(sql).toContain(
      'c.agent_id = $4'
    );

    expect(sql).toContain(
      'c.calculated_at >= $5'
    );

    expect(sql).toContain(
      'c.calculated_at <= $6'
    );

    expect(sql).toContain(
      'LEFT JOIN transactions t ON c.transaction_id = t.id'
    );

    expect(sql).toContain(
      't.provider::text = ANY($7::text[])'
    );

    expect(params).toEqual([
      'company-1',
      'manager-1',
      'branch-requested',
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
      ['mtn', 'telecel'],
    ]);
  });

  test('returns exact zero values if the database unexpectedly returns no row', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      getCommissionTotals({
        company_id: 'company-1',
      })
    ).resolves.toEqual({
      transaction_count: '0',
      total_gross: '0',
      total_provider_share: '0',
      total_net: '0',
    });
  });
});
