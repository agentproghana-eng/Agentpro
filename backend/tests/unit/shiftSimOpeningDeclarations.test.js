jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/agentWalletService', () => ({
  getOrCreateAgentSimWallet: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const {
  query,
  withTransaction,
} = require('../../src/config/database');

const {
  getOrCreateAgentSimWallet,
} = require('../../src/services/agentWalletService');

const {
  auditLog,
} = require('../../src/services/auditService');

const shiftController =
  require('../../src/controllers/shiftController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Shift opening exact-SIM declarations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolves every opening electronic declaration through exact SIM identity', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        branch_id: 'branch-1',
      }],
    });

    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            total: '350.00',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'shift-1',
            agent_id: 'agent-1',
            branch_id: 'branch-1',
            company_id: 'company-1',
            opening_cash_expected: '350.00',
            opening_cash_declared: '350.00',
            opening_cash_variance: '0.00',
            status: 'open',
          }],
        }),
    };

    withTransaction.mockImplementation(
      async (callback) => callback(client),
    );

    getOrCreateAgentSimWallet
      .mockResolvedValueOnce({
        id: 'wallet-mtn-1',
        agent_id: 'agent-1',
        provider: 'mtn',
        identity_status: 'identified',
        sim_iccid: '8901000000000000001',
        installation_id: '11111111-1111-1111-1111-111111111111',
        sim_subscription_id: 1,
        last_known_sim_slot: 0,
        e_float_balance: '1000.00',
        commission_balance: '40.00',
        working_balance: '0.00',
      })
      .mockResolvedValueOnce({
        id: 'wallet-telecel-2',
        agent_id: 'agent-1',
        provider: 'telecel',
        identity_status: 'unresolved',
        sim_iccid: null,
        installation_id: '11111111-1111-1111-1111-111111111111',
        sim_subscription_id: 2,
        last_known_sim_slot: 1,
        e_float_balance: '600.00',
        commission_balance: '25.00',
        working_balance: '400.00',
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
        opening_sim_balances: [
          {
            provider: 'mtn',
            sim_iccid: '8901000000000000001',
            installation_id:
              '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 1,
            sim_slot: 0,
            e_float_declared: '950.00',
            commission_declared: '38.00',
          },
          {
            provider: 'telecel',
            sim_iccid: null,
            installation_id:
              '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 2,
            sim_slot: 1,
            e_float_declared: '625.00',
            commission_declared: '25.00',
            working_declared: '390.00',
          },
        ],
      },
      ip: '127.0.0.1',
      requestId: 'request-sim-opening-1',
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(
      getOrCreateAgentSimWallet
    ).toHaveBeenCalledTimes(2);

    expect(
      getOrCreateAgentSimWallet
    ).toHaveBeenNthCalledWith(
      1,
      client,
      {
        agentId: 'agent-1',
        provider: 'mtn',
        simIccid: '8901000000000000001',
        installationId:
          '11111111-1111-1111-1111-111111111111',
        simSubscriptionId: 1,
        simSlot: 0,
      },
    );

    expect(
      getOrCreateAgentSimWallet
    ).toHaveBeenNthCalledWith(
      2,
      client,
      {
        agentId: 'agent-1',
        provider: 'telecel',
        simIccid: null,
        installationId:
          '11111111-1111-1111-1111-111111111111',
        simSubscriptionId: 2,
        simSlot: 1,
      },
    );
  });
});

test('freezes expected, declared, and variance for every exact-SIM opening balance', async () => {
  query.mockReset();
  withTransaction.mockReset();
  getOrCreateAgentSimWallet.mockReset();

  query.mockResolvedValueOnce({
    rows: [{
      branch_id: 'branch-1',
    }],
  });

  const client = {
    query: jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{
          total: '350.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          branch_id: 'branch-1',
          company_id: 'company-1',
          opening_cash_expected: '350.00',
          opening_cash_declared: '350.00',
          opening_cash_variance: '0.00',
          status: 'open',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  getOrCreateAgentSimWallet
    .mockResolvedValueOnce({
      id: 'wallet-mtn-1',
      agent_id: 'agent-1',
      provider: 'mtn',
      identity_status: 'identified',
      sim_iccid: '8901000000000000001',
      e_float_balance: '1000.00',
      commission_balance: '40.00',
      working_balance: '0.00',
    })
    .mockResolvedValueOnce({
      id: 'wallet-telecel-2',
      agent_id: 'agent-1',
      provider: 'telecel',
      identity_status: 'unresolved',
      sim_iccid: null,
      e_float_balance: '600.00',
      commission_balance: '25.00',
      working_balance: '400.00',
    });

  const req = {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      opening_cash_declared: '350.00',
      opening_sim_balances: [
        {
          provider: 'mtn',
          sim_iccid: '8901000000000000001',
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 1,
          sim_slot: 0,
          e_float_declared: '950.00',
          commission_declared: '38.00',
        },
        {
          provider: 'telecel',
          sim_iccid: null,
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 2,
          sim_slot: 1,
          e_float_declared: '625.00',
          commission_declared: '25.00',
          working_declared: '390.00',
        },
      ],
    },
    ip: '127.0.0.1',
    requestId: 'request-sim-snapshot-1',
  };

  const res = makeRes();

  await shiftController.openShift(req, res);

  // Cash read + shift insert + five electronic balance snapshots.
  expect(client.query).toHaveBeenCalledTimes(7);

  const snapshotCalls = client.query.mock.calls
    .slice(2);

  for (const [sql] of snapshotCalls) {
    expect(sql).toContain(
      'INSERT INTO shift_sim_balance_snapshots',
    );
  }

  expect(snapshotCalls.map(([, params]) => params)).toEqual([
    [
      'shift-1',
      'wallet-mtn-1',
      'e_float',
      1000,
      950,
      -50,
    ],
    [
      'shift-1',
      'wallet-mtn-1',
      'commission',
      40,
      38,
      -2,
    ],
    [
      'shift-1',
      'wallet-telecel-2',
      'e_float',
      600,
      625,
      25,
    ],
    [
      'shift-1',
      'wallet-telecel-2',
      'commission',
      25,
      25,
      0,
    ],
    [
      'shift-1',
      'wallet-telecel-2',
      'working_balance',
      400,
      390,
      -10,
    ],
  ]);

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE agent_sim_wallets',
  );
});

describe('Shift opening SIM balance validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a SIM declaration without Float', async () => {
    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
        opening_sim_balances: [{
          provider: 'mtn',
          sim_iccid: '8901000000000000001',
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 1,
          sim_slot: 0,
          commission_declared: '38.00',
        }],
      },
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'e_float_declared is required for every SIM and must be a non-negative number',
    });

    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a SIM declaration without Commission', async () => {
    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
        opening_sim_balances: [{
          provider: 'mtn',
          sim_iccid: '8901000000000000001',
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 1,
          sim_slot: 0,
          e_float_declared: '950.00',
        }],
      },
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'commission_declared is required for every SIM and must be a non-negative number',
    });

    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a Telecel declaration without Working Account', async () => {
    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
        opening_sim_balances: [{
          provider: 'telecel',
          sim_iccid: '8902000000000000002',
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 2,
          sim_slot: 1,
          e_float_declared: '625.00',
          commission_declared: '25.00',
        }],
      },
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'working_declared is required for Telecel SIMs and must be a non-negative number',
    });

    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('rejects negative electronic declarations', async () => {
    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
        opening_sim_balances: [{
          provider: 'mtn',
          sim_iccid: '8901000000000000001',
          installation_id:
            '11111111-1111-1111-1111-111111111111',
          sim_subscription_id: 1,
          sim_slot: 0,
          e_float_declared: '-1.00',
          commission_declared: '38.00',
        }],
      },
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

test('rejects Working Account declarations for non-Telecel SIMs before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();
  getOrCreateAgentSimWallet.mockReset();

  const req = {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      opening_cash_declared: '350.00',
      opening_sim_balances: [
        {
          provider: 'mtn',
          sim_iccid: '8992330000000000001',
          sim_slot: 0,
          e_float_declared: '1000.00',
          commission_declared: '40.00',

          // MTN must never have a Working Account balance.
          working_declared: '500.00',
        },
      ],
    },
  };

  const res = makeRes();

  await shiftController.openShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'working_declared is only allowed for Telecel SIMs',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(getOrCreateAgentSimWallet).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});
