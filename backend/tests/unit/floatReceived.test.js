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
  resolveAgentFinancialBranch: (...args) =>
    mockResolveBranch(...args)
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

const operationId =
  '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

const installationId =
  '11111111-1111-4111-8111-111111111111';

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent'
    },
    body: {
      provider: 'mtn',
      amount: 500,
      reference: 'FLOAT-RECEIPT-001',
      notes: 'Bought from super-agent',
      client_operation_id: operationId,
      sim_iccid: 'ICCID-001',
      sim_slot: 0,
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
    id: 'tx-float-1',
    reference: 'APG-FLT-TEST',
    network_reference: 'FLOAT-RECEIPT-001',
    status: 'success',
    amount: '500.00',
    provider: 'mtn',
    transaction_type: 'float_received',
    notes: 'Bought from super-agent',
    sim_iccid: 'ICCID-001',
    sim_slot: 0,
    installation_id: null,
    sim_subscription_id: null,
    sim_wallet_id: null,
    branch_id: 'branch-1',
    company_id: 'company-1',
    created_at: new Date('2026-08-09T00:00:00Z'),
    completed_at: new Date('2026-08-09T00:00:01Z'),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockWithTransaction.mockImplementation(async (callback) =>
    callback({
      query: mockClientQuery
    })
  );

  mockResolveBranch.mockResolvedValue({
    ok: true,
    branchId: 'branch-1'
  });

  mockVerifyBusinessSimRoleAssignment.mockResolvedValue({
    ok: true,
    role: 'agent',
    sim_slot: 0
  });
});

describe('Float Received canonical ledger posting', () => {
  it('creates a canonical transaction and credits the exact identified SIM wallet', async () => {
    const wallet = {
      id: 'wallet-1',
      agent_id: 'agent-1',
      provider: 'mtn',
      identity_status: 'identified',
      sim_iccid: 'ICCID-001',
      e_float_balance: '1000.00',
      commission_balance: '0.00',
      last_known_sim_slot: 0
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
          rows: [wallet]
        };
      }

      if (
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET installation_id')
      ) {
        return {
          rows: [wallet]
        };
      }

      if (
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      ) {
        return {
          rows: [{ id: 'tx-float-1' }]
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

      if (
        sql.includes('INSERT INTO agent_balance_movements')
      ) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq(),
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);

    const txInsert =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO transactions')
      );

    expect(txInsert).toBeDefined();
    expect(txInsert[0]).toContain("'float_received'");
    expect(txInsert[0]).toContain("'success'");

    const txWalletLink =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      );

    expect(txWalletLink[1]).toEqual([
      'wallet-1',
      'tx-float-1',
      'agent-1',
      'mtn'
    ]);

    const walletUpdate =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE agent_sim_wallets') &&
        sql.includes('SET e_float_balance')
      );

    expect(walletUpdate[1]).toEqual([
      1500,
      'wallet-1',
      'agent-1',
      'mtn'
    ]);

    const movement =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      );

    expect(movement).toBeDefined();
    expect(movement[1]).toEqual([
      'agent-1',
      'mtn',
      500,
      1000,
      1500,
      'FLOAT-RECEIPT-001',
      'Bought from super-agent',
      'tx-float-1',
      'wallet-1',
      'ICCID-001',
      null,
      null,
      0,
      'identified'
    ]);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_balances')
      )
    ).toBe(false);
  });

  it('credits a complete unresolved SIM identity without merging it into an identified wallet', async () => {
    const wallet = {
      id: 'wallet-unresolved',
      agent_id: 'agent-1',
      provider: 'telecel',
      identity_status: 'unresolved',
      sim_iccid: null,
      installation_id: installationId,
      sim_subscription_id: 20,
      last_known_sim_slot: 1,
      e_float_balance: '250.00',
      commission_balance: '0.00'
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
              provider: 'telecel',
              sim_iccid: null,
              sim_slot: 1,
              installation_id: installationId,
              sim_subscription_id: 20
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
          rows: [wallet]
        };
      }

      if (
        sql.includes('UPDATE transactions') &&
        sql.includes('SET sim_wallet_id')
      ) {
        return {
          rows: [{ id: 'tx-float-1' }]
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

      if (
        sql.includes('INSERT INTO agent_balance_movements')
      ) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq({
        provider: 'telecel',
        sim_iccid: null,
        sim_slot: 1,
        installation_id: installationId,
        sim_subscription_id: 20
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);

    const movement =
      mockClientQuery.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
      );

    expect(movement[1]).toEqual([
      'agent-1',
      'telecel',
      500,
      250,
      750,
      'FLOAT-RECEIPT-001',
      'Bought from super-agent',
      'tx-float-1',
      'wallet-unresolved',
      null,
      installationId,
      20,
      1,
      'unresolved'
    ]);
  });

  it('returns the existing completed declaration without crediting e-Float again', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [existingTransaction()]
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq(),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockResolveBranch).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'tx-float-1',
          idempotent_replay: true
        })
      })
    );
  });

  it('rejects operation-ID reuse when the amount changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [existingTransaction()]
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq({
        amount: 600
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockResolveBranch).not.toHaveBeenCalled();
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects operation-ID reuse when the physical ICCID changes', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [existingTransaction()]
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq({
        sim_iccid: 'ICCID-002'
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it('replays safely for the same unresolved installation subscription and slot', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          provider: 'telecel',
          sim_iccid: null,
          sim_slot: 1,
          installation_id: installationId,
          sim_subscription_id: 20
        })
      ]
    });

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq({
        provider: 'telecel',
        sim_iccid: null,
        sim_slot: 1,
        installation_id: installationId,
        sim_subscription_id: 20
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns the winning concurrent declaration without duplicate posting', async () => {
    let lookupCount = 0;

    mockClientQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        lookupCount += 1;

        if (lookupCount === 1) {
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

    const res = makeRes();

    await balanceController.recordFloatReceived(
      makeReq(),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('agent_sim_wallets')
      )
    ).toBe(false);

    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO agent_balance_movements')
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

    await balanceController.recordFloatReceived(
      makeReq(),
      res
    );

    expect(
      mockVerifyBusinessSimRoleAssignment
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'agent-1',
        provider: 'mtn',
        claimedRole: 'agent',
        simSlot: 0,
        simIccid: 'ICCID-001'
      })
    );

    expect(res.status).toHaveBeenCalledWith(409);

    expect(mockResolveBranch)
      .toHaveBeenCalledTimes(0);
  });

});
