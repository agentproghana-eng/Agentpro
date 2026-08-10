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

function makeReq(query = {}) {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent',
    },
    query,
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

describe('exact SIM wallet balance read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns identified SIM balance separately from legacy unassigned money', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'wallet-identified',
          identity_status: 'identified',
          sim_iccid: '8901000000000000001',
          installation_id: null,
          sim_subscription_id: 7,
          last_known_sim_slot: 0,
          e_float_balance: '120.00',
          commission_balance: '25.00',
          last_updated_at:
            '2026-08-09T12:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'wallet-legacy',
          e_float_balance: '300.00',
          commission_balance: '75.00',
          last_updated_at:
            '2026-08-01T12:00:00.000Z',
        }],
      });

    const req = makeReq({
      provider: 'mtn',
      sim_iccid: '8901000000000000001',
      sim_slot: '0',
    });

    const res = makeRes();

    await balanceController.getOwnSimWalletBalance(
      req,
      res,
    );

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(mockQuery.mock.calls[0][0]).toContain(
      "identity_status = 'identified'",
    );

    expect(mockQuery.mock.calls[0][1]).toEqual([
      'agent-1',
      'mtn',
      '8901000000000000001',
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        provider: 'mtn',
        requested_identity_status: 'identified',
        exact_wallet_exists: true,
        sim_wallet_id: 'wallet-identified',
        e_float_balance: '120.00',
        commission_balance: '25.00',
        reconciliation_required: true,
        legacy_unassigned: expect.objectContaining({
          sim_wallet_id: 'wallet-legacy',
          commission_balance: '75.00',
        }),
      }),
    });
  });

  test('reads the exact unresolved installation subscription and slot wallet', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'wallet-unresolved',
          identity_status: 'unresolved',
          sim_iccid: null,
          installation_id:
            '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 9,
          last_known_sim_slot: 1,
          e_float_balance: '44.00',
          commission_balance: '12.00',
          last_updated_at: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = makeReq({
      provider: 'telecel',
      sim_slot: '1',
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: '9',
    });

    const res = makeRes();

    await balanceController.getOwnSimWalletBalance(
      req,
      res,
    );

    expect(mockQuery.mock.calls[0][0]).toContain(
      "identity_status = 'unresolved'",
    );

    expect(mockQuery.mock.calls[0][1]).toEqual([
      'agent-1',
      'telecel',
      '11111111-1111-4111-8111-111111111111',
      9,
      1,
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        requested_identity_status: 'unresolved',
        exact_wallet_exists: true,
        sim_wallet_id: 'wallet-unresolved',
        commission_balance: '12.00',
        legacy_unassigned: null,
        reconciliation_required: false,
      }),
    });
  });

  test('returns zero exact balance without creating a wallet when none exists', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = makeReq({
      provider: 'mtn',
      sim_iccid: '8901000000000000002',
      sim_slot: '1',
    });

    const res = makeRes();

    await balanceController.getOwnSimWalletBalance(
      req,
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        exact_wallet_exists: false,
        sim_wallet_id: null,
        e_float_balance: '0.00',
        commission_balance: '0.00',
        legacy_unassigned: null,
        reconciliation_required: false,
      }),
    });
  });

  test('refuses provider plus slot as unresolved electronic identity', async () => {
    const req = makeReq({
      provider: 'mtn',
      sim_slot: '0',
    });

    const res = makeRes();

    await balanceController.getOwnSimWalletBalance(
      req,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'SIM_IDENTITY_REQUIRED',
      }),
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
