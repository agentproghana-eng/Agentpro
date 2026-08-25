const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockResolveBranch = jest.fn();
const mockVerifyBusinessSimRoleAssignment =
  jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args)
}));

jest.mock('../../src/services/financialBranchService', () => ({
  resolveAgentFinancialBranch: (...args) => mockResolveBranch(...args)
}));

jest.mock('../../src/services/simRoleTrustService', () => ({
  verifyBusinessSimRoleAssignment: (...args) =>
    mockVerifyBusinessSimRoleAssignment(...args)
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn()
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

const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent'
    },
    body: {
      provider: 'telecel',
      amount: 100,
      reference: '0244000000',
      notes: 'Manual Cash Out',
      client_operation_id: operationId,
      sim_iccid: 'ICCID-001',
      sim_slot: 1,
      ...overrides
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

function existingTransaction(overrides = {}) {
  return {
    id: 'tx-1',
    reference: 'APG-MAN-TEST',
    status: 'success',
    amount: '100.00',
    provider: 'telecel',
    transaction_type: 'cash_out',
    customer_phone: '0244000000',
    notes: 'Manual Cash Out',
    sim_iccid: 'ICCID-001',
    sim_slot: 1,
    branch_id: 'branch-1',
    company_id: 'company-1',
    created_at: new Date('2026-08-09T00:00:00Z'),
    completed_at: new Date('2026-08-09T00:00:01Z'),
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

  mockResolveBranch.mockResolvedValue({
    ok: true,
    branchId: 'branch-1'
  });

  mockVerifyBusinessSimRoleAssignment.mockResolvedValue({
    ok: true,
    role: 'agent',
    sim_slot: 1
  });
});

describe('Manual Cash Out ledger posting', () => {
  it('creates a canonical transaction and posts to the SIM wallet and one cash drawer', async () => {
    const identifiedWallet = {
      id: 'wallet-1',
      agent_id: 'agent-1',
      provider: 'telecel',
      identity_status: 'identified',
      sim_iccid: 'ICCID-001',
      installation_id: null,
      sim_subscription_id: null,
      last_known_sim_slot: 1,
      e_float_balance: '500.00',
      commission_balance: '20.00'
    };

    const cashBalance = {
      id: 'cash-1',
      agent_id: 'agent-1',
      cash_at_hand: '800.00'
    };

    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        return {
          rows: [existingTransaction()]
        };
      }

      if (sql.includes('INSERT INTO agent_sim_wallets')) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM agent_sim_wallets') &&
        sql.includes('FOR UPDATE')
      ) {
        return {
          rows: [identifiedWallet]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET installation_id')
      ) {
        return {
          rows: [identifiedWallet]
        };
      }

      if (sql.includes('INSERT INTO agent_cash_balances')) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM agent_cash_balances') &&
        sql.includes('FOR UPDATE')
      ) {
        return {
          rows: [cashBalance]
        };
      }

      if (
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      ) {
        return {
          rows: [{ id: 'tx-1' }]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET e_float_balance')
      ) {
        return {
          rows: [{ id: 'wallet-1' }]
        };
      }

      if (sql.includes('UPDATE agent_cash_balances')) {
        return {
          rows: [{ id: 'cash-1' }]
        };
      }

      if (sql.includes('INSERT INTO agent_balance_movements')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const req = makeReq();
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const insertTransactionCall =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO transactions')
      );

    expect(insertTransactionCall).toBeDefined();
    expect(insertTransactionCall[1]).toEqual(
      expect.arrayContaining([
        'agent-1',
        'branch-1',
        'company-1',
        'telecel',
        100,
        '0244000000',
        'Manual Cash Out',
        'ICCID-001',
        1,
        operationId
      ])
    );

    const transactionWalletLink =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      );

    expect(transactionWalletLink).toBeDefined();
    expect(transactionWalletLink[1]).toEqual([
      'wallet-1',
      'tx-1',
      'agent-1',
      'telecel'
    ]);

    const eFloatUpdateCall =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET e_float_balance')
      );

    expect(eFloatUpdateCall).toBeDefined();
    expect(eFloatUpdateCall[1]).toEqual([
      600,
      'wallet-1',
      'agent-1',
      'telecel'
    ]);

    const cashUpdateCall =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE agent_cash_balances')
      );

    expect(cashUpdateCall).toBeDefined();
    expect(cashUpdateCall[1]).toEqual([
      700,
      'cash-1',
      'agent-1'
    ]);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE agent_balances')
      )
    ).toBe(false);

    const movementCalls =
      mockClientQuery.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      );

    expect(movementCalls).toHaveLength(2);

    expect(movementCalls[0][1]).toEqual([
      'agent-1',
      'telecel',
      100,
      500,
      600,
      'APG-MAN-TEST',
      'Manual Cash Out',
      'tx-1',
      'wallet-1',
      'ICCID-001',
      null,
      null,
      1,
      'identified'
    ]);

    expect(movementCalls[1][1]).toEqual([
      'agent-1',
      'telecel',
      -100,
      800,
      700,
      'APG-MAN-TEST',
      'Manual Cash Out',
      'tx-1',
      'cash-1',
      'ICCID-001',
      null,
      null,
      1,
      'identified'
    ]);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'tx-1',
          idempotent_replay: false
        })
      })
    );
  });

  it('posts a fresh unresolved SIM operation only to its exact unresolved wallet', async () => {
    const installationId =
      '11111111-1111-4111-8111-111111111111';

    const unresolvedWallet = {
      id: 'wallet-unresolved',
      agent_id: 'agent-1',
      provider: 'telecel',
      identity_status: 'unresolved',
      sim_iccid: null,
      installation_id: installationId,
      sim_subscription_id: 10,
      last_known_sim_slot: 1,
      e_float_balance: '300.00',
      commission_balance: '0.00'
    };

    const cashBalance = {
      id: 'cash-1',
      agent_id: 'agent-1',
      cash_at_hand: '500.00'
    };

    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        return {
          rows: [
            existingTransaction({
              sim_iccid: null,
              installation_id: installationId,
              sim_subscription_id: 10,
              sim_slot: 1
            })
          ]
        };
      }

      if (sql.includes('INSERT INTO agent_sim_wallets')) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM agent_sim_wallets') &&
        sql.includes('FOR UPDATE')
      ) {
        return {
          rows: [unresolvedWallet]
        };
      }

      if (sql.includes('INSERT INTO agent_cash_balances')) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM agent_cash_balances') &&
        sql.includes('FOR UPDATE')
      ) {
        return {
          rows: [cashBalance]
        };
      }

      if (
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      ) {
        return {
          rows: [{ id: 'tx-1' }]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET e_float_balance')
      ) {
        return {
          rows: [{ id: 'wallet-unresolved' }]
        };
      }

      if (sql.includes('UPDATE agent_cash_balances')) {
        return {
          rows: [{ id: 'cash-1' }]
        };
      }

      if (sql.includes('INSERT INTO agent_balance_movements')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: installationId,
      sim_subscription_id: 10
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const movementCalls =
      mockClientQuery.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      );

    expect(movementCalls).toHaveLength(2);

    expect(movementCalls[0][1]).toEqual([
      'agent-1',
      'telecel',
      100,
      300,
      400,
      'APG-MAN-TEST',
      'Manual Cash Out',
      'tx-1',
      'wallet-unresolved',
      null,
      installationId,
      10,
      1,
      'unresolved'
    ]);

    expect(movementCalls[1][1]).toEqual([
      'agent-1',
      'telecel',
      -100,
      500,
      400,
      'APG-MAN-TEST',
      'Manual Cash Out',
      'tx-1',
      'cash-1',
      null,
      installationId,
      10,
      1,
      'unresolved'
    ]);
  });

  it('returns an existing completed operation without moving balances again', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [existingTransaction()]
    });

    const req = makeReq();
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockResolveBranch).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'tx-1',
          idempotent_replay: true
        })
      })
    );
  });

  it('rejects reuse of the operation ID for different data', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [existingTransaction()]
    });

    const req = makeReq({
      amount: 250
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockResolveBranch).not.toHaveBeenCalled();
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it('replays safely for the same identified ICCID and slot', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: 'ICCID-001',
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10
        })
      ]
    });

    const req = makeReq({
      sim_iccid: 'ICCID-001',
      sim_slot: 1,

      // A real ICCID remains authoritative over fallback metadata.
      installation_id: '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 99
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockResolveBranch).not.toHaveBeenCalled();
  });

  it('rejects replay when the identified ICCID changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: 'ICCID-001',
          sim_slot: 1
        })
      ]
    });

    const req = makeReq({
      sim_iccid: 'ICCID-002',
      sim_slot: 1
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockResolveBranch).not.toHaveBeenCalled();
  });

  it('replays safely for the same unresolved installation subscription and slot', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10
        })
      ]
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockResolveBranch).not.toHaveBeenCalled();
  });

  it('rejects unresolved replay when the installation changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10
        })
      ]
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 10
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects unresolved replay when the subscription changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10
        })
      ]
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 11
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects unresolved replay when the SIM slot changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10
        })
      ]
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 0,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10
    });
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns the winning concurrent transaction without duplicate posting', async () => {
    let transactionLookupCount = 0;

    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        transactionLookupCount += 1;

        if (transactionLookupCount === 1) {
          return { rows: [] };
        }

        return {
          rows: [existingTransaction()]
        };
      }

      if (sql.includes('INSERT INTO transactions')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const req = makeReq();
    const res = makeRes();

    await balanceController.recordCashOutManual(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_sim_wallets')
      )
    ).toBe(false);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_cash_balances')
      )
    ).toBe(false);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      )
    ).toBe(false);
  });

  it('locks the exact SIM wallet and single cash drawer before calculating balances', async () => {
    let simWalletLocked = false;
    let cashDrawerLocked = false;

    const identifiedWallet = {
      id: 'wallet-1',
      agent_id: 'agent-1',
      provider: 'telecel',
      identity_status: 'identified',
      sim_iccid: 'ICCID-001',
      e_float_balance: '0.00',
      commission_balance: '0.00',
      last_known_sim_slot: 1
    };

    const cashBalance = {
      id: 'cash-1',
      agent_id: 'agent-1',
      cash_at_hand: '100.00'
    };

    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        return {
          rows: [existingTransaction()]
        };
      }

      if (sql.includes('INSERT INTO agent_sim_wallets')) {
        return { rows: [] };
      }

      if (sql.includes('FROM agent_sim_wallets')) {
        expect(sql).toContain('FOR UPDATE');
        simWalletLocked = true;

        return {
          rows: [identifiedWallet]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET installation_id')
      ) {
        return {
          rows: [identifiedWallet]
        };
      }

      if (sql.includes('INSERT INTO agent_cash_balances')) {
        return { rows: [] };
      }

      if (sql.includes('FROM agent_cash_balances')) {
        expect(sql).toContain('FOR UPDATE');
        cashDrawerLocked = true;

        return {
          rows: [cashBalance]
        };
      }

      if (
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      ) {
        return {
          rows: [{ id: 'tx-1' }]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET e_float_balance')
      ) {
        return {
          rows: [{ id: 'wallet-1' }]
        };
      }

      if (sql.includes('UPDATE agent_cash_balances')) {
        return {
          rows: [{ id: 'cash-1' }]
        };
      }

      if (sql.includes('INSERT INTO agent_balance_movements')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await balanceController.recordCashOutManual(
      makeReq(),
      makeRes()
    );

    expect(simWalletLocked).toBe(true);
    expect(cashDrawerLocked).toBe(true);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_balances')
      )
    ).toBe(false);
  });

  it('rejects a non-Agent physical SIM before branch or balance posting', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: []
    });

    mockVerifyBusinessSimRoleAssignment.mockResolvedValueOnce({
      ok: false,
      status: 409,
      code: 'SIM_ROLE_MISMATCH',
      message: 'The physical SIM is not assigned as Agent.'
    });

    const res = makeRes();

    await balanceController.recordCashOutManual(
      makeReq(),
      res
    );

    expect(
      mockVerifyBusinessSimRoleAssignment
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'agent-1',
        provider: 'telecel',
        claimedRole: 'agent',
        simSlot: 1,
        simIccid: 'ICCID-001'
      })
    );

    expect(res.status).toHaveBeenCalledWith(409);

    expect(mockResolveBranch)
      .toHaveBeenCalledTimes(0);
  });

});
