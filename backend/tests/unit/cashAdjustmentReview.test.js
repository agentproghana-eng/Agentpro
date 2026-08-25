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

function makeReq(action = 'approve', role = 'manager') {
  return {
    user: {
      id: 'reviewer-1',
      company_id: 'company-1',
      role
    },
    params: {
      movement_id: 'movement-1'
    },
    body: {
      action,
      review_notes: 'Reviewed'
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

function pendingMovement(overrides = {}) {
  return {
    id: 'movement-1',
    agent_id: 'agent-1',
    provider: 'telecel',
    movement_type: 'cash_injection',
    balance_type: 'cash_at_hand',
    amount: '100.00',
    balance_before: '500.00',
    balance_after: '500.00',
    status: 'pending',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockWithTransaction.mockImplementation(async (callback) => {
    return callback({
      query: mockClientQuery
    });
  });
});

describe('Cash adjustment review locking and idempotency', () => {
  it('locks the pending movement before approving and applies cash once', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM agent_balance_movements') &&
        sql.includes('FOR UPDATE')
      ) {
        expect(sql).toContain('u.company_id = $2');

        return {
          rows: [pendingMovement()]
        };
      }

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
            id: 'balance-1',
            cash_at_hand: '500.00',
            e_float_balance: '0.00',
            commission_balance: '0.00'
          }]
        };
      }

      if (sql.includes('UPDATE agent_cash_balances')) {
        return { rows: [] };
      }

      if (sql.includes('UPDATE agent_balance_movements')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve'),
      res
    );

    const balanceUpdate =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      );

    expect(balanceUpdate[1]).toEqual([
      600,
      'balance-1'
    ]);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'approved',
          idempotent_replay: false
        }
      })
    );
  });

  it('treats repeated approval as a safe replay without changing cash again', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          status: 'approved',
          balance_before: '500.00',
          balance_after: '600.00'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve'),
      res
    );

    expect(mockClientQuery).toHaveBeenCalledTimes(1);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      )
    ).toBe(false);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'approved',
          idempotent_replay: true
        }
      })
    );
  });

  it('treats repeated rejection as a safe replay', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          status: 'rejected'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('reject'),
      res
    );

    expect(mockClientQuery).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'rejected',
          idempotent_replay: true
        }
      })
    );
  });

  it('rejects an opposite decision after the adjustment is finalized', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          status: 'approved'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('reject'),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'ADJUSTMENT_ALREADY_REVIEWED'
      })
    );
  });

  it('prevents manager from reviewing own pending adjustment', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          agent_id: 'reviewer-1'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve', 'manager'),
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(403);

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'SELF_REVIEW_NOT_ALLOWED'
        })
      );

    expect(mockClientQuery)
      .toHaveBeenCalledTimes(1);
  });

  it('prevents business owner from reviewing own pending adjustment', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          agent_id: 'reviewer-1'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve', 'business_owner'),
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(403);

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'SELF_REVIEW_NOT_ALLOWED'
        })
      );

    expect(mockClientQuery)
      .toHaveBeenCalledTimes(1);
  });

  it('scopes manager review to their own company and managed branches', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: []
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve', 'manager'),
      res
    );

    const [sql, params] = mockClientQuery.mock.calls[0];

    expect(sql).toContain(
      'u.company_id = $2'
    );

    expect(sql).toContain(
      'FROM agent_branches ab'
    );

    expect(sql).toContain(
      'INNER JOIN branch_managers bm'
    );

    expect(sql).toContain(
      'bm.manager_id = $3'
    );

    expect(sql).toContain(
      'FOR UPDATE'
    );

    expect(params).toEqual([
      'movement-1',
      'company-1',
      'reviewer-1'
    ]);

    expect(res.status)
      .toHaveBeenCalledWith(404);
  });

  it('keeps business-owner review company-wide', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: []
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('approve', 'business_owner'),
      res
    );

    const [sql, params] =
      mockClientQuery.mock.calls[0];

    expect(sql).toContain(
      'u.company_id = $2'
    );

    expect(sql).not.toContain(
      'FROM branch_managers bm'
    );

    expect(sql).not.toContain(
      'FROM agent_branches ab'
    );

    expect(params).toEqual([
      'movement-1',
      'company-1'
    ]);

    expect(res.status)
      .toHaveBeenCalledWith(404);
  });

  it('allows superuser review without company restriction', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        pendingMovement({
          status: 'rejected'
        })
      ]
    });

    const res = makeRes();

    await balanceController.reviewCashAdjustment(
      makeReq('reject', 'superuser'),
      res
    );

    const [sql, params] = mockClientQuery.mock.calls[0];

    expect(sql).not.toContain('u.company_id = $2');
    expect(sql).toContain('FOR UPDATE');
    expect(params).toEqual([
      'movement-1'
    ]);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'rejected',
          idempotent_replay: true
        }
      })
    );
  });
});
