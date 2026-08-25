const {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet,
} = require("../../src/services/agentWalletService");

function makeClient(...responses) {
  const query = jest.fn();

  for (const response of responses) {
    query.mockResolvedValueOnce(response);
  }

  return { query };
}

describe("agentWalletService", () => {
  test("creates and locks exactly one cash drawer for the agent", async () => {
    const cashBalance = {
      id: "cash-1",
      agent_id: "agent-1",
      cash_at_hand: "500.00",
    };

    const client = makeClient({ rows: [] }, { rows: [cashBalance] });

    const result = await getOrCreateAgentCashBalance(client, "agent-1");

    expect(result).toEqual(cashBalance);
    expect(client.query).toHaveBeenCalledTimes(2);

    expect(client.query.mock.calls[0][0]).toContain(
      "ON CONFLICT (agent_id) DO NOTHING",
    );

    expect(client.query.mock.calls[1][0]).toContain("FOR UPDATE");
  });

  test("resolves an ICCID-backed wallet as identified", async () => {
    const lockedWallet = {
      id: "wallet-1",
      agent_id: "agent-1",
      provider: "mtn",
      identity_status: "identified",
      sim_iccid: "ICCID-A",
      e_float_balance: "0.00",
      commission_balance: "0.00",
    };

    const refreshedWallet = {
      ...lockedWallet,
      installation_id: "11111111-1111-4111-8111-111111111111",
      sim_subscription_id: 10,
      last_known_sim_slot: 0,
    };

    const client = makeClient(
      { rows: [] },
      { rows: [lockedWallet] },
      { rows: [refreshedWallet] },
    );

    const result = await getOrCreateAgentSimWallet(client, {
      agentId: "agent-1",
      provider: "mtn",
      simIccid: " ICCID-A ",
      installationId: "11111111-1111-4111-8111-111111111111",
      simSubscriptionId: 10,
      simSlot: 0,
    });

    expect(result).toEqual(refreshedWallet);
    expect(client.query).toHaveBeenCalledTimes(3);

    const selectSql = client.query.mock.calls[1][0];

    expect(selectSql).toContain("identity_status = 'identified'");
    expect(selectSql).toContain("sim_iccid = $3");

    expect(selectSql).toContain("sim_role = 'agent'");
    expect(selectSql).toContain("FOR UPDATE");

    const allSql = client.query.mock.calls.map((call) => call[0]).join("\n");

    expect(allSql).not.toContain("legacy_unassigned");
  });

  test("ICCID remains authoritative when fallback metadata changes", async () => {
    const wallet = {
      id: "wallet-identified",
      agent_id: "agent-1",
      provider: "mtn",
      identity_status: "identified",
      sim_iccid: "ICCID-A",
    };

    const refreshed = {
      ...wallet,
      installation_id: "22222222-2222-4222-8222-222222222222",
      sim_subscription_id: 88,
      last_known_sim_slot: 1,
    };

    const client = makeClient(
      { rows: [] },
      { rows: [wallet] },
      { rows: [refreshed] },
    );

    const result = await getOrCreateAgentSimWallet(client, {
      agentId: "agent-1",
      provider: "mtn",
      simIccid: "ICCID-A",
      installationId: "22222222-2222-4222-8222-222222222222",
      simSubscriptionId: 88,
      simSlot: 1,
    });

    expect(result.id).toBe("wallet-identified");
    expect(result.sim_iccid).toBe("ICCID-A");

    // Wallet lookup remains based on ICCID, not installation/subscription.
    expect(client.query.mock.calls[1][1]).toEqual([
      "agent-1",
      "mtn",
      "ICCID-A",
    ]);
  });

  test("resolves complete fallback identity only as unresolved", async () => {
    const wallet = {
      id: "wallet-unresolved",
      agent_id: "agent-1",
      provider: "telecel",
      identity_status: "unresolved",
      sim_iccid: null,
      installation_id: "11111111-1111-4111-8111-111111111111",
      sim_subscription_id: 20,
      last_known_sim_slot: 1,
    };

    const client = makeClient({ rows: [] }, { rows: [wallet] });

    const result = await getOrCreateAgentSimWallet(client, {
      agentId: "agent-1",
      provider: "telecel",
      simIccid: "",
      installationId: "11111111-1111-4111-8111-111111111111",
      simSubscriptionId: 20,
      simSlot: 1,
    });

    expect(result).toEqual(wallet);
    expect(client.query).toHaveBeenCalledTimes(2);

    const selectSql = client.query.mock.calls[1][0];

    expect(selectSql).toContain("identity_status = 'unresolved'");
    expect(selectSql).toContain("installation_id = $3");

    expect(selectSql).toContain("sim_role = 'agent'");
    expect(selectSql).toContain("sim_subscription_id = $4");
    expect(selectSql).toContain("last_known_sim_slot = $5");
    expect(selectSql).toContain("FOR UPDATE");

    const allSql = client.query.mock.calls.map((call) => call[0]).join("\n");

    expect(allSql).not.toContain("legacy_unassigned");
  });

  test("rejects provider-only electronic accounting", async () => {
    const client = makeClient();

    await expect(
      getOrCreateAgentSimWallet(client, {
        agentId: "agent-1",
        provider: "mtn",
        simIccid: null,
        installationId: null,
        simSubscriptionId: null,
        simSlot: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "SIM_IDENTITY_REQUIRED",
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("rejects slot-only fallback identity", async () => {
    const client = makeClient();

    await expect(
      getOrCreateAgentSimWallet(client, {
        agentId: "agent-1",
        provider: "mtn",
        simIccid: "",
        installationId: null,
        simSubscriptionId: null,
        simSlot: 0,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "SIM_IDENTITY_REQUIRED",
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("rejects invalid negative subscription or slot identifiers", async () => {
    const client = makeClient();

    await expect(
      getOrCreateAgentSimWallet(client, {
        agentId: "agent-1",
        provider: "mtn",
        simIccid: "",
        installationId: "11111111-1111-4111-8111-111111111111",
        simSubscriptionId: -1,
        simSlot: 0,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "SIM_IDENTITY_INVALID",
    });

    expect(client.query).not.toHaveBeenCalled();
  });
  test("identified lookup is explicitly Agent role", async () => {
    const wallet = {
      id: "wallet-agent-role",
      agent_id: "operator-1",
      provider: "mtn",
      sim_role: "agent",
      identity_status: "identified",
      sim_iccid: "ICCID-ROLE",
    };

    const client = makeClient(
      { rows: [] },
      { rows: [wallet] },
      { rows: [wallet] },
    );

    await getOrCreateAgentSimWallet(client, {
      agentId: "operator-1",
      provider: "mtn",
      simIccid: "ICCID-ROLE",
      installationId: null,
      simSubscriptionId: 5,
      simSlot: 0,
    });

    const sql = client.query.mock.calls.map((call) => call[0]).join("\n");

    expect(sql).toContain("sim_role");

    expect(sql).toContain("sim_role = 'agent'");
  });
});
