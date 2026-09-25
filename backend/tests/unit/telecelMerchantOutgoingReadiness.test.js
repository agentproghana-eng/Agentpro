const {
  requireTelecelMerchantOutgoingReadiness,
} = require(
  "../../src/services/telecelMerchantOutgoingReadinessService",
);

function knownAccount(balance = "50.00") {
  return {
    current_balance: balance,
    balance_state: "known",
    balance_source: "telecel_balance_sms",
    balance_observed_at: new Date(),
    balance_initialized_at: new Date(),
  };
}

function args(overrides = {}) {
  return {
    agentId: "agent-1",
    amount: "10.00",
    simIccid: "ICCID-MERCHANT",
    installationId: "installation-1",
    simSubscriptionId: 2,
    simSlot: 1,
    ...overrides,
  };
}

describe(
  "Telecel Merchant outgoing pre-USSD readiness",
  () => {
    test(
      "allows a known sufficient Working Account",
      async () => {
        const client = {
          query: jest.fn().mockResolvedValue({
            rows: [knownAccount("50.00")],
          }),
        };

        const result =
          await requireTelecelMerchantOutgoingReadiness(
            client,
            args(),
          );

        expect(result.workingAccountBalance).toBe(50);

        const sql = client.query.mock.calls[0][0];

        expect(sql).toContain(
          "balance_code = 'working_account'",
        );
        expect(sql).not.toContain(
          "balance_code = 'merchant_account'",
        );
      },
    );

    test(
      "blocks when Working Account does not exist",
      async () => {
        const client = {
          query: jest.fn().mockResolvedValue({
            rows: [],
          }),
        };

        await expect(
          requireTelecelMerchantOutgoingReadiness(
            client,
            args(),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
        });
      },
    );

    test(
      "blocks unknown Working Account",
      async () => {
        const client = {
          query: jest.fn().mockResolvedValue({
            rows: [
              {
                current_balance: "50.00",
                balance_state: "unknown",
                balance_source: null,
                balance_observed_at: null,
                balance_initialized_at: null,
              },
            ],
          }),
        };

        await expect(
          requireTelecelMerchantOutgoingReadiness(
            client,
            args(),
          ),
        ).rejects.toMatchObject({
          code:
            "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
        });
      },
    );

    test(
      "blocks insufficient Working Account",
      async () => {
        const client = {
          query: jest.fn().mockResolvedValue({
            rows: [knownAccount("5.00")],
          }),
        };

        await expect(
          requireTelecelMerchantOutgoingReadiness(
            client,
            args({ amount: "10.00" }),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "INSUFFICIENT_MERCHANT_WORKING_BALANCE",
        });
      },
    );

    test(
      "is lookup-only and never creates or updates financial state",
      () => {
        const fs = require("fs");
        const path = require("path");

        const source = fs.readFileSync(
          path.join(
            __dirname,
            "../../src/services/telecelMerchantOutgoingReadinessService.js",
          ),
          "utf8",
        );

        expect(source).not.toMatch(
          /INSERT\s+INTO/i,
        );
        expect(source).not.toMatch(
          /UPDATE\s+(agent_sim_wallets|sim_wallet_balance_accounts)/i,
        );
        expect(source).not.toContain(
          "getOrCreateTelecelMerchantWallet",
        );
      },
    );
  },
);
