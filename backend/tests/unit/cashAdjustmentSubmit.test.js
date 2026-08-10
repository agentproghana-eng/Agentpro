const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args)
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn()
}));

jest.mock('../../src/services/financialBranchService', () => ({
  resolveAgentFinancialBranch: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

const balanceController =
  require('../../src/controllers/balanceController');

function makeReq(adjustmentType, amount = 100) {
  return {
    user: {
      id: 'agent-1'
    },
    body: {
      provider: 'telecel',
      adjustment_type: adjustmentType,
      amount,
      reason: 'Test adjustment'
    }
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  return res;
}

function installCashDrawerMock() {
  mockClientQuery.mockImplementation(async (sql, params) => {
    if (
      sql.includes('INSERT INTO agent_cash_balances') &&
      sql.includes('ON CONFLICT')
    ) {
      return { rows: [] };
    }

    if (
      sql.includes('FROM agent_cash_balances') &&
      sql.includes('FOR UPDATE')
    ) {
      return {
        rows: [{
          id: 'cash-1',
          agent_id: 'agent-1',
          cash_at_hand: '500.00'
        }]
      };
    }

    if (sql.includes('UPDATE agent_cash_balances')) {
      return { rows: [{ id: 'cash-1' }] };
    }

    if (
      sql.includes('INSERT INTO agent_balance_movements') &&
      sql.includes('RETURNING id')
    ) {
      return {
        rows: [{
          id: 'movement-1'
        }]
      };
    }

    if (sql.includes('INSERT INTO agent_balance_movements')) {
      return { rows: [] };
    }

    throw new Error(
      `Unexpected SQL:\n${sql}\nparams=${JSON.stringify(params)}`
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  mockWithTransaction.mockImplementation(async (callback) => {
    return callback({
      query: mockClientQuery
    });
  });

  installCashDrawerMock();
});

describe('Cash adjustment submission canonical cash drawer posting', () => {
  it('cash_set updates the single agent cash drawer and records cash_balance_id', async () => {
    const res = makeRes();

    await balanceController.submitCashAdjustment(
      makeReq('cash_set', 650),
      res
    );

    const cashUpdate =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      );

    expect(cashUpdate).toBeDefined();
    expect(cashUpdate[1]).toEqual([
      650,
      'cash-1'
    ]);

    const movementInsert =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      );

    expect(movementInsert).toBeDefined();
    expect(movementInsert[0]).toContain('cash_balance_id');
    expect(movementInsert[0]).toContain("'cash_set'");
    expect(movementInsert[0]).toContain("'cash_at_hand'");
    expect(movementInsert[1]).toEqual([
      'agent-1',
      null,
      150,
      500,
      650,
      'Test adjustment',
      'cash-1'
    ]);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_balances')
      )
    ).toBe(false);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Cash at hand updated'
    });
  });

  it('cash_injection creates a pending movement without changing cash', async () => {
    const res = makeRes();

    await balanceController.submitCashAdjustment(
      makeReq('cash_injection', 100),
      res
    );

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      )
    ).toBe(false);

    const movementInsert =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements') &&
        sql.includes('RETURNING id')
      );

    expect(movementInsert).toBeDefined();
    expect(movementInsert[0]).toContain('cash_balance_id');
    expect(movementInsert[0]).toContain("'pending'");
    expect(movementInsert[1]).toEqual([
      'agent-1',
      null,
      'cash_injection',
      100,
      500,
      'Test adjustment',
      'cash-1'
    ]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Submitted for manager/owner approval',
      data: {
        movement_id: 'movement-1'
      }
    });
  });

  it('cash_withdrawal records a negative pending movement without changing cash', async () => {
    const res = makeRes();

    await balanceController.submitCashAdjustment(
      makeReq('cash_withdrawal', 75),
      res
    );

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      )
    ).toBe(false);

    const movementInsert =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements') &&
        sql.includes('RETURNING id')
      );

    expect(movementInsert).toBeDefined();
    expect(movementInsert[1]).toEqual([
      'agent-1',
      null,
      'cash_withdrawal',
      -75,
      500,
      'Test adjustment',
      'cash-1'
    ]);
  });
});
