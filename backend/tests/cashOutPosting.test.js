jest.mock("../src/services/agentWalletService", () => ({
  getOrCreateAgentCashBalance: jest.fn(),
  getOrCreateAgentSimWallet: jest.fn()
}));

const {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet
} = require("../src/services/agentWalletService");

const {
  postCashOut
} = require("../src/services/cashOutPostingService");

function makeClient() {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes("UPDATE transactions")) {
        return { rows: [{ id: "tx-1" }] };
      }

      if (sql.includes("UPDATE agent_sim_wallets")) {
        return { rows: [{ id: "wallet-1" }] };
      }

      if (sql.includes("UPDATE agent_cash_balances")) {
        return { rows: [{ id: "cash-1" }] };
      }

      if (sql.includes("INSERT INTO agent_balance_movements")) {
        return { rows: [] };
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
    transaction_type: "cash_out",
    amount: "100.00",
    reference: "APG-CASH-OUT-1",
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

describe("postCashOut", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getOrCreateAgentCashBalance.mockResolvedValue({
      id: "cash-1",
      cash_at_hand: "300.00"
    });
  });

  test("posts identified MTN SIM e-Float up and agent cash down", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      e_float_balance: "400.00"
    });

    const result = await postCashOut(
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
      eFloatBefore: 400,
      eFloatAfter: 500,
      cashBefore: 300,
      cashAfter: 200,
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

    expect(movements[0][1]).toEqual([
      "agent-1",
      "mtn",
      100,
      400,
      500,
      "APG-CASH-OUT-1",
      null,
      "tx-1",
      "wallet-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    expect(movements[1][1]).toEqual([
      "agent-1",
      "mtn",
      -100,
      300,
      200,
      "APG-CASH-OUT-1",
      null,
      "tx-1",
      "cash-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);
  });

  test("posts unresolved MTN SIM provenance without inventing ICCID", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "unresolved",
      e_float_balance: "250.00"
    });

    const result = await postCashOut(
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

    expect(result.simProvenanceStatus).toBe(
      "unresolved"
    );

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
      expect(params[13]).toBe("unresolved");
    }
  });

  test("allows negative cash drawer after confirmed payout", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      e_float_balance: "100.00"
    });

    getOrCreateAgentCashBalance.mockResolvedValue({
      id: "cash-1",
      cash_at_hand: "40.00"
    });

    const result = await postCashOut(
      client,
      baseTransaction({
        amount: "100.00"
      }),
      "agent-1"
    );

    expect(result.eFloatAfter).toBe(200);
    expect(result.cashBefore).toBe(40);
    expect(result.cashAfter).toBe(-60);

    const cashUpdate =
      client.query.mock.calls.find(
        ([sql]) =>
          sql.includes(
            "UPDATE agent_cash_balances"
          )
      );

    expect(cashUpdate[1][0]).toBe(-60);
  });

  test("rejects Telecel or AT Money from canonical Cash Out posting", async () => {
    const client = makeClient();

    await expect(
      postCashOut(
        client,
        baseTransaction({
          provider: "telecel"
        }),
        "agent-1"
      )
    ).rejects.toThrow(
      "Canonical Cash Out posting is only supported for MTN"
    );

    expect(
      getOrCreateAgentSimWallet
    ).not.toHaveBeenCalled();

    expect(
      getOrCreateAgentCashBalance
    ).not.toHaveBeenCalled();

    expect(client.query).not.toHaveBeenCalled();
  });

  test("rejects a pre-linked transaction whose wallet conflicts with stored SIM identity", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-2",
      identity_status: "identified",
      e_float_balance: "500.00"
    });

    await expect(
      postCashOut(
        client,
        baseTransaction({
          sim_wallet_id: "wallet-1"
        }),
        "agent-1"
      )
    ).rejects.toThrow(
      "Cash Out transaction SIM wallet does not match its stored SIM identity"
    );

    expect(client.query).not.toHaveBeenCalled();
  });
});
