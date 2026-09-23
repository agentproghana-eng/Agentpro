jest.mock(
  "../../src/services/auditService",
  () => ({
    auditLog: jest.fn(),
  }),
);

const {
  auditLog,
} = require("../../src/services/auditService");

const {
  reconcileTelecelMerchantBalances,
} = require(
  "../../src/services/telecelMerchantBalanceReconciliationService"
);

const WALLET_ID = "wallet-merchant-1";
const AGENT_ID = "agent-1";

function input(overrides = {}) {
  return {
    simWalletId: WALLET_ID,
    agentId: AGENT_ID,
    companyId: "company-1",
    merchantAccountBalance: "100.00",
    workingAccountBalance: "250.00",
    source: "telecel_balance_sms",
    sourceReference: "observation-ref-1",
    observedAt: "2026-09-23T18:00:00.000Z",
    requestId: "request-1",
    ...overrides,
  };
}

function accountRows({
  merchantState = "unknown",
  workingState = "unknown",
  merchantInitializedAt = null,
  workingInitializedAt = null,
} = {}) {
  return [
    {
      id: "merchant-account-1",
      sim_wallet_id: WALLET_ID,
      balance_code: "merchant_account",
      current_balance: "0.00",
      balance_state: merchantState,
      balance_initialized_at:
        merchantInitializedAt,
    },
    {
      id: "working-account-1",
      sim_wallet_id: WALLET_ID,
      balance_code: "working_account",
      current_balance: "0.00",
      balance_state: workingState,
      balance_initialized_at:
        workingInitializedAt,
    },
  ];
}

function buildClient({
  accounts = accountRows(),
  existingObservation = null,
  newestObservedAt = null,
  walletExists = true,
  failSecondAccountUpdate = false,
} = {}) {
  const calls = [];
  let accountUpdateCount = 0;

  const client = {
    query: jest.fn(async (sql, params = []) => {
      calls.push({ sql, params });

      if (
        sql.includes("FROM agent_sim_wallets")
      ) {
        return {
          rows: walletExists
            ? [
                {
                  id: WALLET_ID,
                  agent_id: AGENT_ID,
                  provider: "telecel",
                  sim_role: "merchant",
                },
              ]
            : [],
        };
      }

      if (
        sql.includes(
          "FROM sim_wallet_balance_accounts",
        )
      ) {
        return { rows: accounts };
      }

      if (
        sql.includes(
          "FROM telecel_merchant_balance_observations",
        ) &&
        sql.includes("source_reference")
      ) {
        return {
          rows: existingObservation
            ? [existingObservation]
            : [],
        };
      }

      if (
        sql.includes(
          "FROM telecel_merchant_balance_observations",
        ) &&
        sql.includes("ORDER BY observed_at DESC")
      ) {
        return {
          rows: newestObservedAt
            ? [
                {
                  observed_at:
                    newestObservedAt,
                },
              ]
            : [],
        };
      }

      if (
        sql.includes(
          "INSERT INTO telecel_merchant_balance_observations",
        )
      ) {
        return {
          rows: [
            {
              id: "observation-1",
            },
          ],
        };
      }

      if (
        sql.includes(
          "UPDATE sim_wallet_balance_accounts",
        )
      ) {
        accountUpdateCount += 1;

        if (
          failSecondAccountUpdate &&
          accountUpdateCount === 2
        ) {
          throw new Error(
            "SIMULATED_SECOND_ACCOUNT_FAILURE",
          );
        }

        return {
          rows: [
            {
              id: params[4],
              current_balance:
                String(params[0]),
              balance_state: "known",
              balance_source: params[1],
              balance_observed_at:
                params[2],
              balance_initialized_at:
                params[3],
            },
          ],
        };
      }

      throw new Error(
        `Unexpected SQL: ${sql}`,
      );
    }),
  };

  return { client, calls };
}

describe(
  "Telecel Merchant balance reconciliation",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      auditLog.mockResolvedValue();
    });

    test(
      "initializes both balances from one trusted observation",
      async () => {
        const { client, calls } =
          buildClient();

        const result =
          await reconcileTelecelMerchantBalances(
            client,
            input(),
          );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(result.observationId).toBe(
          "observation-1",
        );

        const updates = calls.filter(
          ({ sql }) =>
            sql.includes(
              "UPDATE sim_wallet_balance_accounts",
            ),
        );

        expect(updates).toHaveLength(2);

        expect(updates[0].params[0]).toBe(
          100,
        );
        expect(updates[1].params[0]).toBe(
          250,
        );

        expect(updates[0].params[1]).toBe(
          "telecel_balance_sms",
        );
        expect(updates[1].params[1]).toBe(
          "telecel_balance_sms",
        );

        expect(auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: AGENT_ID,
            action:
              "TELECEL_MERCHANT_BALANCES_RECONCILED",
            entityType: "sim_wallet",
            entityId: WALLET_ID,
            dbClient: client,
            strict: true,
          }),
        );
      },
    );

    test(
      "uses one initialization timestamp for both accounts",
      async () => {
        const { client, calls } =
          buildClient();

        await reconcileTelecelMerchantBalances(
          client,
          input(),
        );

        const updates = calls.filter(
          ({ sql }) =>
            sql.includes(
              "UPDATE sim_wallet_balance_accounts",
            ),
        );

        expect(updates).toHaveLength(2);
        expect(updates[0].params[3]).toBeTruthy();
        expect(updates[1].params[3]).toBe(
          updates[0].params[3],
        );
      },
    );

    test(
      "preserves original initialization timestamps during later reconciliation",
      async () => {
        const merchantInitialized =
          "2026-09-20T10:00:00.000Z";
        const workingInitialized =
          "2026-09-20T10:00:01.000Z";

        const { client, calls } =
          buildClient({
            accounts: accountRows({
              merchantState: "known",
              workingState: "known",
              merchantInitializedAt:
                merchantInitialized,
              workingInitializedAt:
                workingInitialized,
            }),
            newestObservedAt:
              "2026-09-22T18:00:00.000Z",
          });

        await reconcileTelecelMerchantBalances(
          client,
          input({
            sourceReference:
              "observation-ref-2",
            observedAt:
              "2026-09-23T18:00:00.000Z",
          }),
        );

        const updates = calls.filter(
          ({ sql }) =>
            sql.includes(
              "UPDATE sim_wallet_balance_accounts",
            ),
        );

        expect(updates[0].params[3]).toBe(
          merchantInitialized,
        );

        expect(updates[1].params[3]).toBe(
          workingInitialized,
        );
      },
    );

    test(
      "replays the exact same observation without financial mutation",
      async () => {
        const { client, calls } =
          buildClient({
            existingObservation: {
              id: "observation-existing",
              merchant_account_balance:
                "100.00",
              working_account_balance:
                "250.00",
              observed_at:
                "2026-09-23T18:00:00.000Z",
            },
          });

        const result =
          await reconcileTelecelMerchantBalances(
            client,
            input(),
          );

        expect(
          result.idempotentReplay,
        ).toBe(true);

        expect(result.observationId).toBe(
          "observation-existing",
        );

        expect(
          calls.some(({ sql }) =>
            sql.includes(
              "UPDATE sim_wallet_balance_accounts",
            ),
          ),
        ).toBe(false);

        expect(auditLog).not.toHaveBeenCalled();
      },
    );

    test(
      "rejects conflicting reuse of an observation reference",
      async () => {
        const { client } = buildClient({
          existingObservation: {
            id: "observation-existing",
            merchant_account_balance:
              "999.00",
            working_account_balance:
              "250.00",
            observed_at:
              "2026-09-23T18:00:00.000Z",
          },
        });

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input(),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_OBSERVATION_CONFLICT",
        });
      },
    );

    test(
      "rejects stale observations before persistence or mutation",
      async () => {
        const { client, calls } =
          buildClient({
            newestObservedAt:
              "2026-09-23T19:00:00.000Z",
          });

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input(),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_OBSERVATION_STALE",
        });

        expect(
          calls.some(({ sql }) =>
            sql.includes(
              "INSERT INTO telecel_merchant_balance_observations",
            ),
          ),
        ).toBe(false);

        expect(
          calls.some(({ sql }) =>
            sql.includes(
              "UPDATE sim_wallet_balance_accounts",
            ),
          ),
        ).toBe(false);
      },
    );

    test(
      "rejects observations too far in the future before database access",
      async () => {
        const { client } =
          buildClient();

        const future =
          new Date(
            Date.now() + 10 * 60 * 1000,
          ).toISOString();

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input({
              observedAt: future,
            }),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_OBSERVATION_INVALID",
        });

        expect(
          client.query,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "rejects a wallet outside the exact Telecel Merchant identity",
      async () => {
        const { client, calls } =
          buildClient({
            walletExists: false,
          });

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input(),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_WALLET_INVALID",
        });

        expect(calls).toHaveLength(1);
      },
    );

    test.each([
      ["merchant", "-0.01", "250.00"],
      ["working", "100.00", "-0.01"],
    ])(
      "rejects negative %s balance before database access",
      async (
        _label,
        merchant,
        working,
      ) => {
        const { client } =
          buildClient();

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input({
              merchantAccountBalance:
                merchant,
              workingAccountBalance:
                working,
            }),
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_OBSERVATION_INVALID",
        });

        expect(
          client.query,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "propagates second-account failure for caller transaction rollback",
      async () => {
        const { client } =
          buildClient({
            failSecondAccountUpdate: true,
          });

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input(),
          ),
        ).rejects.toThrow(
          "SIMULATED_SECOND_ACCOUNT_FAILURE",
        );

        expect(auditLog).not.toHaveBeenCalled();

        const source = require("fs")
          .readFileSync(
            require.resolve(
              "../../src/services/telecelMerchantBalanceReconciliationService",
            ),
            "utf8",
          );

        expect(source).not.toMatch(
          /\bCOMMIT\b/,
        );
        expect(source).not.toMatch(
          /\bROLLBACK\b/,
        );
      },
    );

    test(
      "strict audit failure propagates to caller transaction",
      async () => {
        const { client } =
          buildClient();

        auditLog.mockRejectedValueOnce(
          new Error(
            "SIMULATED_STRICT_AUDIT_FAILURE",
          ),
        );

        await expect(
          reconcileTelecelMerchantBalances(
            client,
            input(),
          ),
        ).rejects.toThrow(
          "SIMULATED_STRICT_AUDIT_FAILURE",
        );

        expect(auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            dbClient: client,
            strict: true,
          }),
        );
      },
    );
  },
);
