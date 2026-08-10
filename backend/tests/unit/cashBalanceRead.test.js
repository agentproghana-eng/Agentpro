const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const balanceController =
  require('../../src/controllers/balanceController');

function makeReq() {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent',
    },
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);

  return res;
}

describe('cash drawer balance read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns the agent single physical cash drawer', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cash-1',
        cash_at_hand: '850.00',
        last_updated_at:
          '2026-08-10T01:00:00.000Z',
      }],
    });

    const req = makeReq();
    const res = makeRes();

    await balanceController.getOwnCashBalance(
      req,
      res,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][0]).toContain(
      'FROM agent_cash_balances',
    );

    expect(mockQuery.mock.calls[0][1]).toEqual([
      'agent-1',
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        cash_balance_id: 'cash-1',
        cash_at_hand: '850.00',
        last_updated_at:
          '2026-08-10T01:00:00.000Z',
      },
    });
  });

  test('returns zero without creating a cash drawer when none exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = makeReq();
    const res = makeRes();

    await balanceController.getOwnCashBalance(
      req,
      res,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        cash_balance_id: null,
        cash_at_hand: '0.00',
        last_updated_at: null,
      },
    });

    const sql = mockQuery.mock.calls
      .map(([queryText]) => String(queryText))
      .join('\n');

    expect(sql).not.toContain(
      'INSERT INTO agent_cash_balances',
    );

    expect(sql).not.toContain(
      'agent_balances',
    );
  });
});
