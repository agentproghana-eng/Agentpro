const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/agentWalletService', () => ({
  getOrCreateAgentSimWallet: jest.fn(),
}));

const shiftController = require('../../src/controllers/shiftController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Current shift reconciliation read contract', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  test('returns exact opening SIM snapshot identities grouped by wallet', async () => {
    const shift = {
      id: 'shift-1',
      agent_id: 'agent-1',
      status: 'open',
      opening_cash_expected: '300.00',
      opening_cash_declared: '325.00',
      opening_cash_variance: '25.00',
      opened_at: '2026-08-15T01:00:00.000Z',
    };

    mockQuery
      .mockResolvedValueOnce({
        rows: [shift],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            snapshot_id: 'snapshot-1',
            sim_wallet_id: 'wallet-mtn-1',
            provider: 'mtn',
            identity_status: 'identified',
            sim_iccid: '8901000000000000001',
            installation_id: null,
            sim_subscription_id: 1,
            last_known_sim_slot: 0,
            balance_type: 'e_float',
            opening_expected: '900.00',
            opening_declared: '950.00',
            opening_variance: '50.00',
          },
          {
            snapshot_id: 'snapshot-2',
            sim_wallet_id: 'wallet-mtn-1',
            provider: 'mtn',
            identity_status: 'identified',
            sim_iccid: '8901000000000000001',
            installation_id: null,
            sim_subscription_id: 1,
            last_known_sim_slot: 0,
            balance_type: 'commission',
            opening_expected: '35.00',
            opening_declared: '38.00',
            opening_variance: '3.00',
          },
          {
            snapshot_id: 'snapshot-3',
            sim_wallet_id: 'wallet-telecel-2',
            provider: 'telecel',
            identity_status: 'unresolved',
            sim_iccid: null,
            installation_id: '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 2,
            last_known_sim_slot: 1,
            balance_type: 'e_float',
            opening_expected: '600.00',
            opening_declared: '625.00',
            opening_variance: '25.00',
          },
          {
            snapshot_id: 'snapshot-4',
            sim_wallet_id: 'wallet-telecel-2',
            provider: 'telecel',
            identity_status: 'unresolved',
            sim_iccid: null,
            installation_id: '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 2,
            last_known_sim_slot: 1,
            balance_type: 'commission',
            opening_expected: '20.00',
            opening_declared: '25.00',
            opening_variance: '5.00',
          },
          {
            snapshot_id: 'snapshot-5',
            sim_wallet_id: 'wallet-telecel-2',
            provider: 'telecel',
            identity_status: 'unresolved',
            sim_iccid: null,
            installation_id: '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 2,
            last_known_sim_slot: 1,
            balance_type: 'working_balance',
            opening_expected: '375.00',
            opening_declared: '390.00',
            opening_variance: '15.00',
          },
        ],
      });

    const req = {
      user: {
        id: 'agent-1',
      },
    };

    const res = createResponse();

    await shiftController.getCurrentShift(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const snapshotCall = mockQuery.mock.calls[1];
    const snapshotSql = snapshotCall[0];
    const snapshotParams = snapshotCall[1];

    expect(snapshotSql).toContain('FROM shift_sim_balance_snapshots');
    expect(snapshotSql).toContain('JOIN agent_sim_wallets');
    expect(snapshotParams).toEqual(['shift-1']);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        ...shift,
        opening_sim_balances: [
          {
            sim_wallet_id: 'wallet-mtn-1',
            provider: 'mtn',
            identity_status: 'identified',
            sim_iccid: '8901000000000000001',
            installation_id: null,
            sim_subscription_id: 1,
            sim_slot: 0,
            balances: [
              {
                balance_type: 'e_float',
                opening_expected: '900.00',
                opening_declared: '950.00',
                opening_variance: '50.00',
              },
              {
                balance_type: 'commission',
                opening_expected: '35.00',
                opening_declared: '38.00',
                opening_variance: '3.00',
              },
            ],
          },
          {
            sim_wallet_id: 'wallet-telecel-2',
            provider: 'telecel',
            identity_status: 'unresolved',
            sim_iccid: null,
            installation_id: '11111111-1111-1111-1111-111111111111',
            sim_subscription_id: 2,
            sim_slot: 1,
            balances: [
              {
                balance_type: 'e_float',
                opening_expected: '600.00',
                opening_declared: '625.00',
                opening_variance: '25.00',
              },
              {
                balance_type: 'commission',
                opening_expected: '20.00',
                opening_declared: '25.00',
                opening_variance: '5.00',
              },
              {
                balance_type: 'working_balance',
                opening_expected: '375.00',
                opening_declared: '390.00',
                opening_variance: '15.00',
              },
            ],
          },
        ],
      },
    });
  });

  test('returns null without reading snapshots when there is no open shift', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = {
      user: {
        id: 'agent-1',
      },
    };

    const res = createResponse();

    await shiftController.getCurrentShift(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
    });
  });
});
