jest.mock("../src/services/agentWalletService", () => ({
  getOrCreateAgentSimWallet: jest.fn()
}));

const {
  getOrCreateAgentSimWallet
} = require("../src/services/agentWalletService");

const {
  postWorkingFloatTransfer
} = require("../src/services/workingFloatPostingService");

function makeClient() {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes("UPDATE transactions")) {
        return {
          rows: [{ id: "tx-1" }]
        };
      }

      if (sql.includes("UPDATE agent_sim_wallets")) {
        return {
          rows: [{ id: "wallet-1" }]
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
    provider: "telecel",
    transaction_type: "working_to_float",
    amount: "100.00",
    reference: "APG-WORKING-FLOAT-1",
    notes: "",
    sim_iccid: "8902000000000000001",
    sim_slot: 0,
    installation_id:
      "11111111-1111-4111-8111-111111111111",
    sim_subscription_id: 7,
    sim_wallet_id: null,
    ...overrides
  };
}

describe("postWorkingFloatTransfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      working_balance: "500.00",
      e_float_balance: "200.00"
    });
  });

  test("posts Telecel Working Account to Float on the same exact SIM", async () => {
    const client = makeClient();

    const result = await postWorkingFloatTransfer(
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
        provider: "telecel",
        simIccid: "8902000000000000001",
        installationId:
          "11111111-1111-4111-8111-111111111111",
        simSubscriptionId: 7,
        simSlot: 0
      }
    );

    expect(result).toMatchObject({
      simWalletId: "wallet-1",
      transactionType: "working_to_float",
      amount: 100,
      workingBefore: 500,
      workingAfter: 400,
      eFloatBefore: 200,
      eFloatAfter: 300,
      simProvenanceStatus: "identified"
    });

    const walletUpdate =
      client.query.mock.calls.find(
        ([sql]) =>
          sql.includes(
            "UPDATE agent_sim_wallets"
          )
      );

    expect(walletUpdate[1]).toEqual([
      400,
      300,
      "wallet-1",
      "agent-1",
      "telecel"
    ]);

    const movements =
      client.query.mock.calls.filter(
        ([sql]) =>
          sql.includes(
            "INSERT INTO agent_balance_movements"
          )
      );

    expect(movements).toHaveLength(2);

    // Working Account decreases.
    expect(movements[0][1]).toEqual([
      "agent-1",
      "telecel",
      "working_to_float",
      "working_balance",
      -100,
      500,
      400,
      "APG-WORKING-FLOAT-1",
      null,
      "tx-1",
      "wallet-1",
      "8902000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    // Operational Float increases.
    expect(movements[1][1]).toEqual([
      "agent-1",
      "telecel",
      "working_to_float",
      "e_float",
      100,
      200,
      300,
      "APG-WORKING-FLOAT-1",
      null,
      "tx-1",
      "wallet-1",
      "8902000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);
  });

  test("posts Telecel Float to Working Account on the same exact SIM", async () => {
    const client = makeClient();

    const result = await postWorkingFloatTransfer(
      client,
      baseTransaction({
        transaction_type: "float_to_working"
      }),
      "agent-1"
    );

    expect(result).toMatchObject({
      transactionType: "float_to_working",
      amount: 100,
      workingBefore: 500,
      workingAfter: 600,
      eFloatBefore: 200,
      eFloatAfter: 100
    });

    const walletUpdate =
      client.query.mock.calls.find(
        ([sql]) =>
          sql.includes(
            "UPDATE agent_sim_wallets"
          )
      );

    expect(walletUpdate[1]).toEqual([
      600,
      100,
      "wallet-1",
      "agent-1",
      "telecel"
    ]);

    const movements =
      client.query.mock.calls.filter(
        ([sql]) =>
          sql.includes(
            "INSERT INTO agent_balance_movements"
          )
      );

    expect(movements).toHaveLength(2);

    // Operational Float decreases.
    expect(movements[0][1]).toEqual([
      "agent-1",
      "telecel",
      "float_to_working",
      "e_float",
      -100,
      200,
      100,
      "APG-WORKING-FLOAT-1",
      null,
      "tx-1",
      "wallet-1",
      "8902000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);

    // Working Account increases.
    expect(movements[1][1]).toEqual([
      "agent-1",
      "telecel",
      "float_to_working",
      "working_balance",
      100,
      500,
      600,
      "APG-WORKING-FLOAT-1",
      null,
      "tx-1",
      "wallet-1",
      "8902000000000000001",
      "11111111-1111-4111-8111-111111111111",
      7,
      0,
      "identified"
    ]);
  });

  test("preserves unresolved Telecel SIM provenance without inventing ICCID", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "unresolved",
      working_balance: "300.00",
      e_float_balance: "400.00"
    });

    const result = await postWorkingFloatTransfer(
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
      expect(params[10]).toBe("wallet-1");
      expect(params[11]).toBeNull();

      expect(params[12]).toBe(
        "22222222-2222-4222-8222-222222222222"
      );

      expect(params[13]).toBe(9);
      expect(params[14]).toBe(1);
      expect(params[15]).toBe(
        "unresolved"
      );
    }
  });

  test("allows negative exact-SIM source balance to expose legacy attribution gaps", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-1",
      identity_status: "identified",
      working_balance: "40.00",
      e_float_balance: "20.00"
    });

    const workingToFloat =
      await postWorkingFloatTransfer(
        client,
        baseTransaction({
          amount: "100.00"
        }),
        "agent-1"
      );

    expect(
      workingToFloat.workingAfter
    ).toBe(-60);

    expect(
      workingToFloat.eFloatAfter
    ).toBe(120);
  });

  test.each([
    "mtn",
    "at_money"
  ])(
    "rejects %s Working/Float transfer before locking or moving balances",
    async (provider) => {
      const client = makeClient();

      await expect(
        postWorkingFloatTransfer(
          client,
          baseTransaction({
            provider
          }),
          "agent-1"
        )
      ).rejects.toThrow(
        "Working Account / Float transfer posting is only supported for Telecel"
      );

      expect(
        getOrCreateAgentSimWallet
      ).not.toHaveBeenCalled();

      expect(
        client.query
      ).not.toHaveBeenCalled();
    }
  );

  test("rejects a pre-linked transaction whose wallet conflicts with stored SIM identity", async () => {
    const client = makeClient();

    getOrCreateAgentSimWallet.mockResolvedValue({
      id: "wallet-2",
      identity_status: "identified",
      working_balance: "500.00",
      e_float_balance: "200.00"
    });

    await expect(
      postWorkingFloatTransfer(
        client,
        baseTransaction({
          sim_wallet_id: "wallet-1"
        }),
        "agent-1"
      )
    ).rejects.toThrow(
      "Working/Float transaction SIM wallet does not match its stored SIM identity"
    );

    expect(
      client.query
    ).not.toHaveBeenCalled();
  });
});
