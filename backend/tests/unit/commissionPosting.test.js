const mockGetOrCreateAgentSimWallet = jest.fn();

jest.mock('../../src/services/agentWalletService', () => ({
  getOrCreateAgentSimWallet: (...args) =>
    mockGetOrCreateAgentSimWallet(...args)
}));

const {
  calculateAndPostCommission
} = require('../../src/services/commissionPostingService');

function makeTransaction(overrides = {}) {
  return {
    id: 'tx-1',
    reference: 'APG-TX-001',
    agent_id: 'agent-1',
    branch_id: 'branch-1',
    company_id: 'company-1',
    provider: 'mtn',
    transaction_type: 'send_money',
    amount: '100.00',
    sim_iccid: '8901000000000000001',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 7,
    sim_wallet_id: null,
    ...overrides
  };
}

function makeClient() {
  return {
    query: jest.fn()
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Commission ledger posting', () => {
  it('posts full provider commission to the exact identified SIM wallet', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          rate_percent: '0.0200',
          threshold_amount: null,
          cap_amount: null,
          provider_share_percent: '0.3000'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'commission-1' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'tx-1' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'wallet-1' }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    mockGetOrCreateAgentSimWallet.mockResolvedValue({
      id: 'wallet-1',
      identity_status: 'identified',
      commission_balance: '10.00',
      e_float_balance: '100.00'
    });

    const result = await calculateAndPostCommission(
      client,
      makeTransaction(),
      'agent-1'
    );

    expect(result).toEqual({
      commissionId: 'commission-1',
      gross: 2,
      providerShare: 0,
      net: 2,
      simWalletId: 'wallet-1'
    });

    expect(
      mockGetOrCreateAgentSimWallet
    ).toHaveBeenCalledWith(
      client,
      {
        agentId: 'agent-1',
        provider: 'mtn',
        simIccid: '8901000000000000001',
        installationId:
          '11111111-1111-4111-8111-111111111111',
        simSubscriptionId: 7,
        simSlot: 0
      }
    );

    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE agent_balances')
      )
    ).toBe(false);

    const walletUpdate =
      client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE agent_sim_wallets')
      );

    expect(walletUpdate[1]).toEqual([
      12,
      'wallet-1',
      'agent-1',
      'mtn'
    ]);

    const movement =
      client.query.mock.calls.find(([sql]) =>
        String(sql).includes(
          'INSERT INTO agent_balance_movements'
        )
      );

    expect(movement[1]).toEqual([
      'agent-1',
      'mtn',
      2,
      10,
      12,
      'APG-TX-001',
      'tx-1',
      'wallet-1',
      '8901000000000000001',
      '11111111-1111-4111-8111-111111111111',
      7,
      0,
      'identified'
    ]);
  });

  it('posts earned commission to the exact unresolved SIM wallet', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          rate_percent: '0.0200',
          threshold_amount: null,
          cap_amount: null,
          provider_share_percent: '0.3000'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'commission-1' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'tx-1' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'wallet-u1' }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    mockGetOrCreateAgentSimWallet.mockResolvedValue({
      id: 'wallet-u1',
      identity_status: 'unresolved',
      commission_balance: '5.00',
      e_float_balance: '20.00'
    });

    const transaction = makeTransaction({
      sim_iccid: null,
      installation_id:
        '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 9,
      sim_slot: 1
    });

    const result = await calculateAndPostCommission(
      client,
      transaction,
      'agent-1'
    );

    expect(result.simWalletId).toBe('wallet-u1');

    const movement =
      client.query.mock.calls.find(([sql]) =>
        String(sql).includes(
          'INSERT INTO agent_balance_movements'
        )
      );

    expect(movement[1]).toEqual([
      'agent-1',
      'mtn',
      2,
      5,
      7,
      'APG-TX-001',
      'tx-1',
      'wallet-u1',
      null,
      '22222222-2222-4222-8222-222222222222',
      9,
      1,
      'unresolved'
    ]);
  });

  it('uses an exact provider and transaction type rule lookup without wildcard fallback', async () => {
    const client = makeClient();

    client.query.mockResolvedValue({
      rows: []
    });

    const result =
      await calculateAndPostCommission(
        client,
        makeTransaction(),
        'agent-1'
      );

    expect(result).toBeNull();
    expect(client.query).toHaveBeenCalledTimes(1);

    const [
      sql,
      params
    ] = client.query.mock.calls[0];

    expect(sql).toContain(
      'AND provider = $2'
    );

    expect(sql).toContain(
      'AND transaction_type = $3'
    );

    expect(sql).not.toContain(
      'provider IS NULL'
    );

    expect(sql).not.toContain(
      'transaction_type IS NULL'
    );

    expect(params).toEqual([
      'company-1',
      'mtn',
      'send_money'
    ]);
  });

  it.each([
    ['mtn', 'cash_in'],
    ['telecel', 'send_money'],
    ['at_money', 'send_money'],
    ['mtn', 'airtime'],
  ])(
    'does not query commission rules for unsupported %s / %s',
    async (
      provider,
      transactionType
    ) => {
      const client = makeClient();

      const result =
        await calculateAndPostCommission(
          client,
          makeTransaction({
            provider,
            transaction_type:
              transactionType
          }),
          'agent-1'
        );

      expect(result).toBeNull();

      expect(
        client.query
      ).not.toHaveBeenCalled();

      expect(
        mockGetOrCreateAgentSimWallet
      ).not.toHaveBeenCalled();
    }
  );

  it('allows Telecel Deposit to reach exact rule lookup', async () => {
    const client = makeClient();

    client.query.mockResolvedValue({
      rows: []
    });

    await calculateAndPostCommission(
      client,
      makeTransaction({
        provider: 'telecel',
        transaction_type: 'cash_in'
      }),
      'agent-1'
    );

    expect(
      client.query.mock.calls[0][1]
    ).toEqual([
      'company-1',
      'telecel',
      'cash_in'
    ]);
  });

  it('allows AT Money Withdrawal to reach exact rule lookup', async () => {
    const client = makeClient();

    client.query.mockResolvedValue({
      rows: []
    });

    await calculateAndPostCommission(
      client,
      makeTransaction({
        provider: 'at_money',
        transaction_type: 'cash_out'
      }),
      'agent-1'
    );

    expect(
      client.query.mock.calls[0][1]
    ).toEqual([
      'company-1',
      'at_money',
      'cash_out'
    ]);
  });

  it('does not post provider commission for unrelated services', async () => {
    const client = makeClient();

    const result =
      await calculateAndPostCommission(
        client,
        makeTransaction({
          transaction_type: 'airtime'
        }),
        'agent-1'
      );

    expect(result).toBeNull();
    expect(client.query).not.toHaveBeenCalled();

    expect(
      mockGetOrCreateAgentSimWallet
    ).not.toHaveBeenCalled();
  });

  it('does nothing when no commission rule applies', async () => {
    const client = makeClient();

    client.query.mockResolvedValue({
      rows: []
    });

    const result = await calculateAndPostCommission(
      client,
      makeTransaction(),
      'agent-1'
    );

    expect(result).toBeNull();
    expect(client.query).toHaveBeenCalledTimes(1);

    expect(
      mockGetOrCreateAgentSimWallet
    ).not.toHaveBeenCalled();
  });

  it('rejects a transaction already linked to a conflicting SIM wallet', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          rate_percent: '0.0200',
          threshold_amount: null,
          cap_amount: null,
          provider_share_percent: '0.3000'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'commission-1' }]
      });

    mockGetOrCreateAgentSimWallet.mockResolvedValue({
      id: 'wallet-2',
      identity_status: 'identified',
      commission_balance: '10.00'
    });

    await expect(
      calculateAndPostCommission(
        client,
        makeTransaction({
          sim_wallet_id: 'wallet-1'
        }),
        'agent-1'
      )
    ).rejects.toThrow(
      'Commission transaction SIM wallet does not match its stored SIM identity'
    );

    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE agent_sim_wallets')
      )
    ).toBe(false);
  });

  it('propagates accounting errors', async () => {
    const client = makeClient();

    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          rate_percent: '0.0200',
          threshold_amount: null,
          cap_amount: null,
          provider_share_percent: '0.3000'
        }]
      })
      .mockRejectedValueOnce(
        new Error('commission insert failed')
      );

    await expect(
      calculateAndPostCommission(
        client,
        makeTransaction(),
        'agent-1'
      )
    ).rejects.toThrow(
      'commission insert failed'
    );
  });
});
