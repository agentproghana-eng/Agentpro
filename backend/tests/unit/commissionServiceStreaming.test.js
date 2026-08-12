const mockQuery = jest.fn();
const mockStreamQueryBatches = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) =>
    mockQuery(...args),
  streamQueryBatches: (...args) =>
    mockStreamQueryBatches(...args),
}));

const {
  streamCommissionSummaryRows,
} = require('../../src/services/commissionService');

describe('commissionService streaming', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('streams grouped rows through the PostgreSQL cursor in 500-row batches', async () => {
    const received = [];

    mockStreamQueryBatches
      .mockImplementation(
        async (sql, params, options) => {
          expect(options.batchSize)
            .toBe(500);

          expect(sql).toContain(
            'c.agent_id AS group_id'
          );

          expect(sql).toContain(
            'LEFT JOIN users u ON u.id = c.agent_id'
          );

          expect(sql).toContain(
            'GROUP BY c.agent_id, u.first_name, u.last_name'
          );

          expect(sql).toContain(
            'ORDER BY label ASC, c.agent_id ASC'
          );

          expect(sql).not.toMatch(
            /LIMIT\s+5000/i
          );

          expect(params).toEqual([
            'company-1',
            'manager-1',
            'branch-1',
            ['mtn', 'telecel'],
          ]);

          await options.onRows([
            {
              group_id: 'agent-1',
              label: 'Agent One',
            },
            {
              group_id: 'agent-2',
              label: 'Agent Two',
            },
          ]);
        }
      );

    await streamCommissionSummaryRows(
      {
        company_id: 'company-1',
        manager_id: 'manager-1',
        branch_id: 'branch-1',
        provider: 'mtn,telecel',
        group_by: 'agent',
      },
      async (row) => {
        received.push(row);
      }
    );

    expect(mockStreamQueryBatches)
      .toHaveBeenCalledTimes(1);

    expect(received).toEqual([
      {
        group_id: 'agent-1',
        label: 'Agent One',
      },
      {
        group_id: 'agent-2',
        label: 'Agent Two',
      },
    ]);

    expect(mockQuery)
      .not.toHaveBeenCalled();
  });

  test('requires an onRow callback before database work', async () => {
    await expect(
      streamCommissionSummaryRows(
        {
          company_id: 'company-1',
          group_by: 'day',
        }
      )
    ).rejects.toThrow(
      'streamCommissionSummaryRows requires an onRow callback'
    );

    expect(mockStreamQueryBatches)
      .not.toHaveBeenCalled();
  });
});
