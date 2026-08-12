const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  getCommissionSummary,
} = require('../../src/services/commissionService');

describe('commissionService grouping', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    mockQuery.mockResolvedValue({
      rows: [],
    });
  });

  test('groups by agent identity and exposes an agent label', async () => {
    await getCommissionSummary({
      company_id: 'company-1',
      group_by: 'agent',
    });

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'c.agent_id AS group_id'
    );

    expect(sql).toContain(
      'LEFT JOIN users u ON u.id = c.agent_id'
    );

    expect(sql).toContain(
      'u.first_name'
    );

    expect(sql).toContain(
      'u.last_name'
    );

    expect(sql).toContain(
      'AS label'
    );

    expect(sql).toContain(
      'GROUP BY c.agent_id, u.first_name, u.last_name'
    );

    expect(sql).toContain(
      'ORDER BY label ASC, c.agent_id ASC'
    );

    expect(sql).not.toContain(
      "DATE_TRUNC('day', c.calculated_at) AS period"
    );

    expect(params).toEqual([
      'company-1',
    ]);
  });

  test('groups by branch identity and exposes a branch label', async () => {
    await getCommissionSummary({
      company_id: 'company-1',
      group_by: 'branch',
    });

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'c.branch_id AS group_id'
    );

    expect(sql).toContain(
      'LEFT JOIN branches b ON b.id = c.branch_id'
    );

    expect(sql).toContain(
      'b.name AS label'
    );

    expect(sql).toContain(
      'GROUP BY c.branch_id, b.name'
    );

    expect(sql).toContain(
      'ORDER BY label ASC, c.branch_id ASC'
    );

    expect(sql).not.toContain(
      "DATE_TRUNC('day', c.calculated_at) AS period"
    );

    expect(params).toEqual([
      'company-1',
    ]);
  });

  test.each([
    [
      'day',
      "DATE_TRUNC('day', c.calculated_at)",
    ],
    [
      'week',
      "DATE_TRUNC('week', c.calculated_at)",
    ],
    [
      'month',
      "DATE_TRUNC('month', c.calculated_at)",
    ],
    [
      'year',
      "DATE_TRUNC('year', c.calculated_at)",
    ],
  ])(
    'preserves %s date grouping',
    async (groupBy, expression) => {
      await getCommissionSummary({
        company_id: 'company-1',
        group_by: groupBy,
      });

      const [sql] =
        mockQuery.mock.calls[0];

      expect(sql).toContain(
        `${expression} AS period`
      );

      expect(sql).toContain(
        `GROUP BY ${expression}`
      );

      expect(sql).toContain(
        'ORDER BY period DESC'
      );
    }
  );

  test('falls back safely to day grouping for an unknown value', async () => {
    await getCommissionSummary({
      company_id: 'company-1',
      group_by:
        'totally_invalid_sql_fragment',
    });

    const [sql] =
      mockQuery.mock.calls[0];

    expect(sql).toContain(
      "DATE_TRUNC('day', c.calculated_at) AS period"
    );

    expect(sql).not.toContain(
      'totally_invalid_sql_fragment'
    );
  });

  test('combines provider filtering with agent grouping without losing either join', async () => {
    await getCommissionSummary({
      company_id: 'company-1',
      provider: 'mtn,telecel',
      group_by: 'agent',
    });

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'LEFT JOIN transactions t ON c.transaction_id = t.id'
    );

    expect(sql).toContain(
      'LEFT JOIN users u ON u.id = c.agent_id'
    );

    expect(sql).toContain(
      't.provider::text = ANY($2::text[])'
    );

    expect(params).toEqual([
      'company-1',
      ['mtn', 'telecel'],
    ]);
  });
});
