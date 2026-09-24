const {
  getOrCreateTelecelMerchantWallet,
} = require("../../src/services/telecelMerchantWalletService");

function identifiedClient({
  definitions = [
    { balance_code: "merchant_account" },
    { balance_code: "working_account" },
  ],
} = {}) {
  const calls = [];

  const wallet = {
    id: "merchant-wallet-1",
    agent_id: "agent-1",
    provider: "telecel",
    sim_role: "merchant",
    identity_status: "identified",
    sim_iccid: "iccid-1",
  };

  const accounts = [
    {
      id: "merchant-account-1",
      sim_wallet_id: wallet.id,
      balance_code: "merchant_account",
      current_balance: "0.00",
    },
    {
      id: "working-account-1",
      sim_wallet_id: wallet.id,
      balance_code: "working_account",
      current_balance: "0.00",
    },
  ];

  const client = {
    query: jest.fn(async (sql, params = []) => {
      calls.push({ sql, params });

      if (sql.includes("FROM sim_wallet_balance_definitions")) {
        return { rows: definitions };
      }

      if (
        sql.includes("INSERT INTO agent_sim_wallets") &&
        sql.includes("'identified'")
      ) {
        return { rows: [] };
      }

      if (
        sql.includes("FROM agent_sim_wallets") &&
        sql.includes("identity_status = 'identified'")
      ) {
        return { rows: [wallet] };
      }

      if (
        sql.includes("UPDATE agent_sim_wallets") &&
        sql.includes("RETURNING *")
      ) {
        return { rows: [wallet] };
      }

      if (sql.includes("INSERT INTO sim_wallet_balance_accounts")) {
        return { rows: [] };
      }

      if (
        sql.includes("FROM sim_wallet_balance_accounts") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: accounts };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };

  return { client, calls, wallet, accounts };
}

describe("Telecel Merchant wallet behavioral boundary", () => {
  test("resolves an identified SIM strictly as Telecel Merchant", async () => {
    const { client, calls } = identifiedClient();

    const result = await getOrCreateTelecelMerchantWallet(client, {
      agentId: "agent-1",
      simIccid: "iccid-1",
      installationId: "install-1",
      simSubscriptionId: 2,
      simSlot: 1,
    });

    expect(result.simWallet.sim_role).toBe("merchant");
    expect(result.simWallet.provider).toBe("telecel");

    const walletSql = calls
      .filter(({ sql }) => sql.includes("agent_sim_wallets"))
      .map(({ sql }) => sql)
      .join("\n");

    expect(walletSql).toContain("'telecel'");
    expect(walletSql).toContain("'merchant'");
    expect(walletSql).not.toContain("sim_role = 'agent'");
  });

  test("returns the two isolated generic Merchant accounts", async () => {
    const { client } = identifiedClient();

    const result = await getOrCreateTelecelMerchantWallet(client, {
      agentId: "agent-1",
      simIccid: "iccid-1",
      installationId: "install-1",
      simSubscriptionId: 2,
      simSlot: 1,
    });

    expect(result.merchantAccount.balance_code).toBe(
      "merchant_account",
    );
    expect(result.workingAccount.balance_code).toBe(
      "working_account",
    );
    expect(result.merchantAccount.sim_wallet_id).toBe(
      result.simWallet.id,
    );
    expect(result.workingAccount.sim_wallet_id).toBe(
      result.simWallet.id,
    );
  });

  test("locks both Merchant balance accounts before returning", async () => {
    const { client, calls } = identifiedClient();

    await getOrCreateTelecelMerchantWallet(client, {
      agentId: "agent-1",
      simIccid: "iccid-1",
      installationId: "install-1",
      simSubscriptionId: 2,
      simSlot: 1,
    });

    const lock = calls.find(
      ({ sql }) =>
        sql.includes("FROM sim_wallet_balance_accounts") &&
        sql.includes("FOR UPDATE"),
    );

    expect(lock).toBeDefined();
    expect(lock.params[1]).toEqual([
      "merchant_account",
      "working_account",
    ]);
  });

  test("fails closed when a required balance capability is absent", async () => {
    const { client } = identifiedClient({
      definitions: [{ balance_code: "merchant_account" }],
    });

    await expect(
      getOrCreateTelecelMerchantWallet(client, {
        agentId: "agent-1",
        simIccid: "iccid-1",
      }),
    ).rejects.toMatchObject({
      code: "MERCHANT_BALANCE_NOT_ENABLED",
      statusCode: 422,
    });

    const walletMutation = client.query.mock.calls.some(
      ([sql]) => sql.includes("INSERT INTO agent_sim_wallets"),
    );

    expect(walletMutation).toBe(false);
  });

  test("fails closed before DB access when SIM identity is incomplete", async () => {
    const client = {
      query: jest.fn(),
    };

    await expect(
      getOrCreateTelecelMerchantWallet(client, {
        agentId: "agent-1",
        installationId: "install-1",
        simSubscriptionId: 2,
      }),
    ).rejects.toMatchObject({
      code: "SIM_IDENTITY_REQUIRED",
      statusCode: 422,
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("never accesses Agent cash or legacy Agent balance columns", async () => {
    const { client, calls } = identifiedClient();

    await getOrCreateTelecelMerchantWallet(client, {
      agentId: "agent-1",
      simIccid: "iccid-1",
    });

    const sql = calls.map((call) => call.sql).join("\n");

    expect(sql).not.toContain("agent_cash_balances");
    expect(sql).not.toContain("cash_at_hand");
    expect(sql).not.toContain("e_float_balance");
    expect(sql).not.toContain("working_balance");
    expect(sql).not.toContain("commission_balance");
  });
});
