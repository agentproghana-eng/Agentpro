const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  getCommissionSummary,
} = require('../../src/services/commissionService');

describe('commissionService manager scope', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('intersects explicit branch filters with manager assignments', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getCommissionSummary({
      company_id: 'company-1',
      manager_id: 'manager-1',
      branch_id: 'branch-unmanaged',
      from_date: '2026-08-01T00:00:00.000Z',
      to_date: '2026-08-12T23:59:59.999Z',
      group_by: 'day',
    });

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

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
      'c.calculated_at >= $4'
    );

    expect(sql).toContain(
      'c.calculated_at <= $5'
    );

    expect(params).toEqual([
      'company-1',
      'manager-1',
      'branch-unmanaged',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);
  });

  test('scopes all manager commissions when no branch is selected', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getCommissionSummary({
      company_id: 'company-1',
      manager_id: 'manager-1',
      group_by: 'month',
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

    expect(params).toEqual([
      'company-1',
      'manager-1',
    ]);
  });
});
