jest.mock(
  "../../src/services/telecelMerchantWalletService",
  () => ({
    getOrCreateTelecelMerchantWallet: jest.fn(),
  }),
);

const {
  getOrCreateTelecelMerchantWallet,
} = require("../../src/services/telecelMerchantWalletService");

const {
  postTelecelMerchantECash,
} = require("../../src/services/telecelMerchantECashPostingService");

function setupBalances({
  merchant = "100.00",
  working = "40.00",
} = {}) {
  getOrCreateTelecelMerchantWallet.mockResolvedValue({
    simWallet: {
      id: "wallet-1",
      provider: "telecel",
      sim_role: "merchant",
    },
    merchantAccount: {
      id: "merchant-1",
      balance_code: "merchant_account",
      balance_state: "known",
      current_balance: merchant,
    },
    workingAccount: {
      id: "working-1",
      balance_code: "working_account",
      balance_state: "known",
      current_balance: working,
    },
  });
}

function clientWithUpdates(updateBalances) {
  const movementCalls = [];

  const client = {
    query: jest.fn(async (sql, params = []) => {
      if (
        sql.includes("UPDATE sim_wallet_balance_accounts")
      ) {
        const [delta, id] = params;
        const before = Number(updateBalances[id]);
        const after = before + Number(delta);

        if (after < 0) {
          return { rows: [] };
        }

        updateBalances[id] = after;

        return {
          rows: [
            {
              id,
              current_balance: after.toFixed(2),
            },
          ],
        };
      }

      if (
        sql.includes(
          "INSERT INTO sim_wallet_balance_movements",
        )
      ) {
        movementCalls.push(params);
        return { rows: [] };
      }

      if (sql.includes("UPDATE transactions")) {
        return { rows: [{ id: params[1] }] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };

  return { client, movementCalls };
}

function tx(type, amount = "25.00") {
  return {
    id: "tx-1",
    agent_id: "agent-1",
    provider: "telecel",
    sim_role: "merchant",
    transaction_type: type,
    amount,
    sim_iccid: "iccid-1",
    installation_id: "install-1",
    sim_subscription_id: 2,
    sim_slot: 1,
  };
}

describe("Telecel Merchant E-Cash posting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Merchant Account -> Working Account posts exact deltas", async () => {
    setupBalances();

    const balances = {
      "merchant-1": 100,
      "working-1": 40,
    };

    const { client, movementCalls } =
      clientWithUpdates(balances);

    await postTelecelMerchantECash(
      client,
      tx("float_to_working"),
      "agent-1",
    );

    expect(balances["merchant-1"]).toBe(75);
    expect(balances["working-1"]).toBe(65);

    expect(movementCalls).toHaveLength(2);

    expect(movementCalls[0]).toEqual([
      "merchant-1",
      "tx-1",
      "merchant_to_working",
      -25,
      "75.00",
    ]);

    expect(movementCalls[1]).toEqual([
      "working-1",
      "tx-1",
      "merchant_to_working",
      25,
      "65.00",
    ]);
  });

  test("Working Account -> Merchant Account posts exact deltas", async () => {
    setupBalances();

    const balances = {
      "merchant-1": 100,
      "working-1": 40,
    };

    const { client, movementCalls } =
      clientWithUpdates(balances);

    await postTelecelMerchantECash(
      client,
      tx("working_to_float"),
      "agent-1",
    );

    expect(balances["merchant-1"]).toBe(125);
    expect(balances["working-1"]).toBe(15);

    expect(movementCalls).toHaveLength(2);

    expect(movementCalls[0]).toEqual([
      "working-1",
      "tx-1",
      "working_to_merchant",
      -25,
      "15.00",
    ]);

    expect(movementCalls[1]).toEqual([
      "merchant-1",
      "tx-1",
      "working_to_merchant",
      25,
      "125.00",
    ]);
  });

  test("unknown opening balances fail closed before any financial mutation", async () => {
    getOrCreateTelecelMerchantWallet.mockResolvedValue({
      simWallet: {
        id: "merchant-wallet-unknown",
      },
      merchantAccount: {
        id: "merchant-account-unknown",
        balance_code: "merchant_account",
        current_balance: "0.00",
        balance_state: "unknown",
      },
      workingAccount: {
        id: "working-account-known",
        balance_code: "working_account",
        current_balance: "50.00",
        balance_state: "known",
      },
    });

    const client = {
      query: jest.fn(),
    };

    await expect(
      postTelecelMerchantECash(
        client,
        {
          id: "tx-unknown-opening-balance",
          provider: "telecel",
          sim_role: "merchant",
          transaction_type: "float_to_working",
          amount: "10.00",
          sim_iccid: "ICCID-MERCHANT",
          sim_slot: 1,
          installation_id: "installation-1",
          sim_subscription_id: 2,
        },
        "agent-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("insufficient source balance fails before credit or ledger movement", async () => {
    setupBalances({
      merchant: "10.00",
      working: "40.00",
    });

    const balances = {
      "merchant-1": 10,
      "working-1": 40,
    };

    const { client, movementCalls } =
      clientWithUpdates(balances);

    await expect(
      postTelecelMerchantECash(
        client,
        tx("float_to_working", "25.00"),
        "agent-1",
      ),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_MERCHANT_BALANCE",
      statusCode: 422,
    });

    expect(balances["merchant-1"]).toBe(10);
    expect(balances["working-1"]).toBe(40);
    expect(movementCalls).toHaveLength(0);
  });

  test("rejects non-Merchant role before wallet resolution", async () => {
    const transaction = tx("float_to_working");
    transaction.sim_role = "agent";

    await expect(
      postTelecelMerchantECash(
        { query: jest.fn() },
        transaction,
        "agent-1",
      ),
    ).rejects.toMatchObject({
      code: "MERCHANT_ACCOUNTING_ROLE_INVALID",
    });

    expect(
      getOrCreateTelecelMerchantWallet,
    ).not.toHaveBeenCalled();
  });

  test("rejects non-Telecel provider before wallet resolution", async () => {
    const transaction = tx("float_to_working");
    transaction.provider = "mtn";

    await expect(
      postTelecelMerchantECash(
        { query: jest.fn() },
        transaction,
        "agent-1",
      ),
    ).rejects.toMatchObject({
      code: "MERCHANT_ACCOUNTING_PROVIDER_INVALID",
    });

    expect(
      getOrCreateTelecelMerchantWallet,
    ).not.toHaveBeenCalled();
  });

  test("rejects unsupported Merchant transaction type", async () => {
    await expect(
      postTelecelMerchantECash(
        { query: jest.fn() },
        tx("send_money"),
        "agent-1",
      ),
    ).rejects.toMatchObject({
      code: "MERCHANT_ACCOUNTING_TYPE_INVALID",
    });

    expect(
      getOrCreateTelecelMerchantWallet,
    ).not.toHaveBeenCalled();
  });

  test("links the exact Merchant transaction to the Merchant SIM wallet", async () => {
    setupBalances();

    const balances = {
      "merchant-1": 100,
      "working-1": 40,
    };

    const { client } = clientWithUpdates(balances);

    await postTelecelMerchantECash(
      client,
      tx("float_to_working"),
      "agent-1",
    );

    const linkCall = client.query.mock.calls.find(
      ([sql]) => sql.includes("UPDATE transactions"),
    );

    expect(linkCall).toBeDefined();
    expect(linkCall[1]).toEqual([
      "wallet-1",
      "tx-1",
      "agent-1",
      "float_to_working",
    ]);

    expect(linkCall[0]).toContain(
      "provider = 'telecel'",
    );
    expect(linkCall[0]).toContain(
      "sim_role = 'merchant'",
    );
    expect(linkCall[0]).toContain(
      "transaction_type = $4",
    );
  });

  test("fails closed when the transaction cannot be linked", async () => {
    setupBalances();

    const balances = {
      "merchant-1": 100,
      "working-1": 40,
    };

    const { client } = clientWithUpdates(balances);

    const original = client.query;

    client.query = jest.fn(async (sql, params = []) => {
      if (sql.includes("UPDATE transactions")) {
        return { rows: [] };
      }

      return original(sql, params);
    });

    await expect(
      postTelecelMerchantECash(
        client,
        tx("float_to_working"),
        "agent-1",
      ),
    ).rejects.toMatchObject({
      code: "MERCHANT_TRANSACTION_LINK_FAILED",
      statusCode: 422,
    });
  });

  test("documents caller transaction requirement for rollback safety", async () => {
    setupBalances();

    const balances = {
      "merchant-1": 100,
      "working-1": 40,
    };

    const { client } = clientWithUpdates(balances);

    const original = client.query;

    client.query = jest.fn(async (sql, params = []) => {
      if (
        sql.includes(
          "INSERT INTO sim_wallet_balance_movements",
        )
      ) {
        throw new Error("SIMULATED_LEDGER_FAILURE");
      }

      return original(sql, params);
    });

    await expect(
      postTelecelMerchantECash(
        client,
        tx("float_to_working"),
        "agent-1",
      ),
    ).rejects.toThrow("SIMULATED_LEDGER_FAILURE");

    // The service deliberately owns no COMMIT/ROLLBACK. The caller's
    // database transaction must roll back both balance updates.
    const source = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../src/services/telecelMerchantECashPostingService.js",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\bCOMMIT\b/);
    expect(source).not.toMatch(/\bROLLBACK\b/);
  });

  test("does not touch physical cash or Agent legacy ledger", () => {
    const fs = require("fs");
    const path = require("path");

    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/services/telecelMerchantECashPostingService.js",
      ),
      "utf8",
    );

    expect(source).not.toContain("agent_cash_balances");
    expect(source).not.toContain("cash_at_hand");
    expect(source).not.toContain("agent_balance_movements");
    expect(source).not.toContain("e_float_balance");
    expect(source).not.toContain("working_balance");
    expect(source).not.toContain("commission_balance");
  });
});
