jest.mock("../src/services/agentWalletService", () => ({
  getOrCreateAgentSimWallet: jest.fn()
}));

const {
  getOrCreateAgentSimWallet
} = require("../src/services/agentWalletService");

const {
  postCommissionTransfer
} = require("../src/services/commissionTransferPostingService");

function makeClient() {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes("UPDATE transactions")) {
        return { rows: [{ id: "tx-1" }] };
      }

      if (sql.includes("UPDATE agent_sim_wallets")) {
        return { rows: [{ id: "wallet-1" }] };
      }

      if (sql.includes("INSERT INTO agent_balance_movements")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    })
  };
}

function baseTransaction(overrides = {}) {
  return {
    id: "tx-1",
    agent_id: "agent-1",
    provider: "mtn",
    transaction_type: "commission_transfer",
    amount: "10.00",
    reference: "APG-TX-1",
    notes: "",
    sim_iccid: "8901000000000000001",
    sim_slot: 0,
    installation_id: "11111111-1111-4111-8111-111111111111",
    sim_subscription_id: 7,
    sim_wallet_id: null,
    ...overrides
  };
}

describe("postCommissionTransfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("posts identified SIM commission down and e-Float up", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      commission_balance: "25.00",
      e_float_balance: "100.00"
    });

    const result = await postCommissionTransfer(
      client,
      baseTransaction(),
      "agent-1"
    );

    expect(getOrCreateAgentSimWallet).toHaveBeenCalledWith(
      client,
      {
        agentId: "agent-1",
        provider: "mtn",
        simIccid: "8901000000000000001",
        installationId:
          "11111111-1111-4111-8111-111111111111",
        simSubscriptionId: 7,
        simSlot: 0
      }
    );

    expect(result).toMatchObject({
      simWalletId: "wallet-1",
      amount: 10,
      commissionBefore: 25,
      commissionAfter: 15,
      eFloatBefore: 100,
      eFloatAfter: 110,
      simProvenanceStatus: "identified"
    });

    const walletUpdate = client.query.mock.calls.find(
      ([sql]) => sql.includes("UPDATE agent_sim_wallets")
    );

    expect(walletUpdate[1]).toEqual([
      15,
      110,
      "wallet-1",
      "agent-1",
      "mtn"
    ]);

    const movements = client.query.mock.calls.filter(
      ([sql]) =>
        sql.includes("INSERT INTO agent_balance_movements")
    );

    expect(movements).toHaveLength(2);

    // Commission side.
    expect(movements[0][1]).toEqual([
      "agent-1",
      "mtn",
      "commission",
      -10,
      25,
      15,
      "APG-TX-1",
      null,
      "tx-1",
      "wallet-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    // e-Float side.
    expect(movements[1][1]).toEqual([
      "agent-1",
      "mtn",
      "e_float",
      10,
      100,
      110,
      "APG-TX-1",
      null,
      "tx-1",
      "wallet-1",
      "8901000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);
  });

  test("posts unresolved SIM provenance without inventing ICCID", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "unresolved",
      commission_balance: "40.00",
      e_float_balance: "20.00"
    });

    const transaction = baseTransaction({
      sim_iccid: null,
      installation_id:
        "22222222-2222-4222-8222-222222222222",
      sim_subscription_id: 9,
      sim_slot: 1
    });

    const result = await postCommissionTransfer(
      client,
      transaction,
      "agent-1"
    );

    expect(result.simProvenanceStatus).toBe("unresolved");

    expect(getOrCreateAgentSimWallet).toHaveBeenCalledWith(
      client,
      {
        agentId: "agent-1",
        provider: "mtn",
        simIccid: null,
        installationId:
          "22222222-2222-4222-8222-222222222222",
        simSubscriptionId: 9,
        simSlot: 1
      }
    );

    const movements = client.query.mock.calls.filter(
      ([sql]) =>
        sql.includes("INSERT INTO agent_balance_movements")
    );

    expect(movements).toHaveLength(2);

    for (const [, params] of movements) {
      expect(params[9]).toBe("wallet-1");
      expect(params[10]).toBeNull();
      expect(params[11]).toBe(
        "22222222-2222-4222-8222-222222222222"
      );
      expect(params[12]).toBe(9);
      expect(params[13]).toBe(1);
      expect(params[14]).toBe("unresolved");
    }
  });

  test("allows negative exact-SIM commission to expose legacy attribution gap", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      commission_balance: "5.00",
      e_float_balance: "50.00"
    });

    const result = await postCommissionTransfer(
      client,
      baseTransaction({ amount: "10.00" }),
      "agent-1"
    );

    expect(result.commissionBefore).toBe(5);
    expect(result.commissionAfter).toBe(-5);
    expect(result.eFloatAfter).toBe(60);

    const walletUpdate = client.query.mock.calls.find(
      ([sql]) => sql.includes("UPDATE agent_sim_wallets")
    );

    expect(walletUpdate[1][0]).toBe(-5);
    expect(walletUpdate[1][1]).toBe(60);
  });

  test("rejects a pre-linked transaction whose wallet conflicts with stored SIM identity", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-2",
      identity_status: "identified",
      commission_balance: "20.00",
      e_float_balance: "20.00"
    });

    await expect(
      postCommissionTransfer(
        client,
        baseTransaction({
          sim_wallet_id: "wallet-1"
        }),
        "agent-1"
      )
    ).rejects.toThrow(
      "Commission Transfer transaction SIM wallet does not match its stored SIM identity"
    );

    expect(client.query).not.toHaveBeenCalled();
  });
});
