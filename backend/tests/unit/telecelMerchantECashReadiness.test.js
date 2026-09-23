const {
  requireTelecelMerchantECashReadiness,
} = require("../../src/services/telecelMerchantECashReadinessService");

jest.mock(
  "../../src/services/telecelMerchantObservationWalletService",
  () => ({
    resolveExistingTelecelMerchantWallet: jest.fn(),
  }),
);

const {
  resolveExistingTelecelMerchantWallet,
} = require("../../src/services/telecelMerchantObservationWalletService");

describe("Telecel Merchant E-Cash pre-USSD readiness", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    resolveExistingTelecelMerchantWallet.mockResolvedValue({
      id: "merchant-wallet-1",
      provider: "telecel",
      sim_role: "merchant",
    });
  });

  test("allows exact wallet only when both balances are known", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "merchant-account-1",
            balance_code: "merchant_account",
            balance_state: "known",
            balance_source: "telecel_balance_sms",
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
          {
            id: "working-account-1",
            balance_code: "working_account",
            balance_state: "known",
            balance_source: "telecel_balance_sms",
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
        ],
      }),
    };

    const result = await requireTelecelMerchantECashReadiness(
      client,
      {
        agentId: "agent-1",
        simIccid: "iccid-1",
        simSlot: 1,
      },
    );

    expect(result.simWallet.id).toBe("merchant-wallet-1");
    expect(result.merchantAccount.balance_code).toBe(
      "merchant_account",
    );
    expect(result.workingAccount.balance_code).toBe(
      "working_account",
    );

    expect(
      resolveExistingTelecelMerchantWallet,
    ).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        agentId: "agent-1",
        simIccid: "iccid-1",
        simSlot: 1,
      }),
    );
  });

  test("fails closed when one required balance is missing", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            balance_code: "merchant_account",
            balance_state: "known",
            balance_source: "telecel_balance_sms",
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
        ],
      }),
    };

    await expect(
      requireTelecelMerchantECashReadiness(client, {
        agentId: "agent-1",
        simIccid: "iccid-1",
        simSlot: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    });
  });

  test("fails closed when a required balance is unknown", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            balance_code: "merchant_account",
            balance_state: "known",
            balance_source: "telecel_balance_sms",
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
          {
            balance_code: "working_account",
            balance_state: "unknown",
            balance_source: null,
            balance_observed_at: null,
            balance_initialized_at: null,
          },
        ],
      }),
    };

    await expect(
      requireTelecelMerchantECashReadiness(client, {
        agentId: "agent-1",
        simIccid: "iccid-1",
        simSlot: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    });
  });

  test("requires provenance for every known balance", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            balance_code: "merchant_account",
            balance_state: "known",
            balance_source: null,
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
          {
            balance_code: "working_account",
            balance_state: "known",
            balance_source: "telecel_balance_sms",
            balance_observed_at: new Date(),
            balance_initialized_at: new Date(),
          },
        ],
      }),
    };

    await expect(
      requireTelecelMerchantECashReadiness(client, {
        agentId: "agent-1",
        simIccid: "iccid-1",
        simSlot: 1,
      }),
    ).rejects.toMatchObject({
      code: "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    });
  });

  test("uses lookup-only wallet resolution and never provisions identity", async () => {
    const fs = require("fs");
    const path = require("path");

    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/services/telecelMerchantECashReadinessService.js",
      ),
      "utf8",
    );

    expect(source).toContain(
      "resolveExistingTelecelMerchantWallet",
    );

    expect(source).not.toContain(
      "getOrCreateTelecelMerchantWallet",
    );

    expect(source).not.toMatch(
      /INSERT\s+INTO\s+(agent_sim_wallets|sim_wallet_balance_accounts)/i,
    );

    expect(source).not.toMatch(
      /UPDATE\s+sim_wallet_balance_accounts/i,
    );
  });
});
