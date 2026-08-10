jest.mock("../src/services/agentWalletService", () => ({
  getOrCreateAgentCashBalance: jest.fn(),
  getOrCreateAgentSimWallet: jest.fn()
}));

const {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet
} = require("../src/services/agentWalletService");

const {
  postPayToAgent
} = require("../src/services/payToAgentPostingService");

function makeClient() {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes("UPDATE transactions")) {
        return {
          rows: [{ id: "tx-1" }]
        };
      }

      if (
        sql.includes(
          "UPDATE agent_sim_wallets"
        )
      ) {
        return {
          rows: [{ id: "wallet-1" }]
        };
      }

      if (
        sql.includes(
          "UPDATE agent_cash_balances"
        )
      ) {
        return {
          rows: [{ id: "cash-1" }]
        };
      }

      if (
        sql.includes(
          "INSERT INTO agent_balance_movements"
        )
      ) {
        return {
          rows: []
        };
      }

      throw new Error(
        `Unexpected SQL in test: ${sql}`
      );
    })
  };
}

function baseTransaction(overrides = {}) {
  return {
    id: "tx-1",
    agent_id: "agent-1",
    provider: "mtn",
    transaction_type: "bill_payment",
    amount: "100.00",
    fee: "1.00",
    reference: "APG-PAY-AGENT-1",
    payment_reference: "FLOAT EXCHANGE",
    customer_phone: "0240000000",
    notes: "",
    sim_iccid: "8901000000000000001",
    sim_slot: 0,
    installation_id:
      "11111111-1111-4111-8111-111111111111",
    sim_subscription_id: 7,
    sim_wallet_id: null,
    ...overrides
  };
}

describe("postPayToAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getOrCreateAgentCashBalance.mockResolvedValue({
      id: "cash-1",
      cash_at_hand: "200.00"
    });

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      e_float_balance: "500.00"
    });
  });

  test("posts MTN Pay to Agent as exact-SIM e-Float down and cash up", async () => {
    const client = makeClient();

    const result = await postPayToAgent(
      client,
      baseTransaction(),
      "agent-1"
    );

    expect(
      getOrCreateAgentSimWallet
    ).toHaveBeenCalledWith(
      client,
      {
        agentId: "agent-1",
        provider: "mtn",
        simIccid:
          "8901000000000000001",
        installationId:
          "11111111-1111-4111-8111-111111111111",
        simSubscriptionId: 7,
        simSlot: 0
      }
    );

    expect(
      getOrCreateAgentCashBalance
    ).toHaveBeenCalledWith(
      client,
      "agent-1"
    );

    expect(result).toMatchObject({
      simWalletId: "wallet-1",
      cashBalanceId: "cash-1",
      amount: 100,
      eFloatBefore: 500,
      eFloatAfter: 400,
      cashBefore: 200,
      cashAfter: 300,
      simProvenanceStatus: "identified"
    });

    const movements =
      client.query.mock.calls.filter(
        ([sql]) =>
          sql.includes(
            "INSERT INTO agent_balance_movements"
          )
      );

    expect(movements).toHaveLength(2);

    expect(movements[0][0]).toContain(
      "'bill_payment'"
    );

    expect(movements[0][0]).toContain(
      "'e_float'"
    );

    expect(movements[0][1]).toEqual([
      "agent-1",
      "mtn",
      -100,
      500,
      400,
      "APG-PAY-AGENT-1",
      null,
      "tx-1",
      "wallet-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    expect(movements[1][0]).toContain(
      "'bill_payment'"
    );

    expect(movements[1][0]).toContain(
      "'cash_at_hand'"
    );

    expect(movements[1][1]).toEqual([
      "agent-1",
      "mtn",
      100,
      200,
      300,
      "APG-PAY-AGENT-1",
      null,
      "tx-1",
      "cash-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    // Network fee remains metadata only.
    expect(movements[0][1][2]).toBe(-100);
    expect(movements[1][1][2]).toBe(100);
  });

  test("posts unresolved MTN SIM provenance without inventing ICCID", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "unresolved",
      e_float_balance: "250.00"
    });

    const result = await postPayToAgent(
      client,
      baseTransaction({
        sim_iccid: null,
        installation_id:
          "22222222-2222-4222-8222-222222222222",
        sim_subscription_id: 9,
        sim_slot: 1
      }),
      "agent-1"
    );

    expect(
      result.simProvenanceStatus
    ).toBe("unresolved");

    const movements =
      client.query.mock.calls.filter(
        ([sql]) =>
          sql.includes(
            "INSERT INTO agent_balance_movements"
          )
      );

    expect(movements).toHaveLength(2);

    for (const [, params] of movements) {
      expect(params[9]).toBeNull();

      expect(params[10]).toBe(
        "22222222-2222-4222-8222-222222222222"
      );

      expect(params[11]).toBe(9);
      expect(params[12]).toBe(1);
      expect(params[13]).toBe(
        "unresolved"
      );
    }
  });

  test("allows negative exact-SIM e-Float to expose historical attribution gaps", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      e_float_balance: "40.00"
    });

    const result = await postPayToAgent(
      client,
      baseTransaction({
        amount: "100.00"
      }),
      "agent-1"
    );

    expect(result.eFloatBefore).toBe(40);
    expect(result.eFloatAfter).toBe(-60);
    expect(result.cashAfter).toBe(300);

    const walletUpdate =
      client.query.mock.calls.find(
        ([sql]) =>
          sql.includes(
            "UPDATE agent_sim_wallets"
          )
      );

    expect(walletUpdate[1][0]).toBe(-60);
  });

  test.each([
    "telecel",
    "at_money"
  ])(
    "rejects %s Pay to Agent before locking or moving balances",
    async (provider) => {
      const client = makeClient();

      await expect(
        postPayToAgent(
          client,
          baseTransaction({
            provider
          }),
          "agent-1"
        )
      ).rejects.toThrow(
        "Pay to Agent posting is only supported for MTN"
      );

      expect(
        getOrCreateAgentSimWallet
      ).not.toHaveBeenCalled();

      expect(
        getOrCreateAgentCashBalance
      ).not.toHaveBeenCalled();

      expect(client.query).not.toHaveBeenCalled();
    }
  );

  test("rejects a pre-linked transaction whose wallet conflicts with stored SIM identity", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-2",
      identity_status: "identified",
      e_float_balance: "500.00"
    });

    await expect(
      postPayToAgent(
        client,
        baseTransaction({
          sim_wallet_id: "wallet-1"
        }),
        "agent-1"
      )
    ).rejects.toThrow(
      "Pay to Agent transaction SIM wallet does not match its stored SIM identity"
    );

    // Wallet/cash locks occur first, but no mutation may follow.
    expect(client.query).not.toHaveBeenCalled();
  });
});
