jest.mock(
  "../../src/services/telecelMerchantWalletService",
  () => ({
    getOrCreateTelecelMerchantWallet:
      jest.fn(),
  }),
);

const {
  getOrCreateTelecelMerchantWallet,
} = require(
  "../../src/services/telecelMerchantWalletService",
);

const {
  bootstrapTelecelMerchantWallet,
} = require(
  "../../src/services/telecelMerchantWalletBootstrapService",
);

describe(
  "Telecel Merchant wallet bootstrap",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      "creates only structural Merchant accounting state through the role-scoped wallet service",
      async () => {
        const client = {};

        getOrCreateTelecelMerchantWallet
          .mockResolvedValue({
            simWallet: {
              id: "wallet-1",
              sim_role: "merchant",
            },
            merchantAccount: {
              balance_code:
                "merchant_account",
              current_balance: "0.00",
              balance_state: "unknown",
            },
            workingAccount: {
              balance_code:
                "working_account",
              current_balance: "0.00",
              balance_state: "unknown",
            },
          });

        const result =
          await bootstrapTelecelMerchantWallet(
            client,
            {
              agentId: "user-1",
              simIccid: "iccid-1",
              installationId: null,
              simSubscriptionId: 7,
              simSlot: 1,
            },
          );

        expect(
          getOrCreateTelecelMerchantWallet,
        ).toHaveBeenCalledWith(
          client,
          {
            agentId: "user-1",
            simIccid: "iccid-1",
            installationId: null,
            simSubscriptionId: 7,
            simSlot: 1,
          },
        );

        expect(
          result.merchantAccount.balance_state,
        ).toBe("unknown");

        expect(
          result.workingAccount.balance_state,
        ).toBe("unknown");
      },
    );

    test(
      "preserves already-known balances instead of resetting them",
      async () => {
        getOrCreateTelecelMerchantWallet
          .mockResolvedValue({
            simWallet: {
              id: "wallet-1",
            },
            merchantAccount: {
              current_balance: "25.00",
              balance_state: "known",
            },
            workingAccount: {
              current_balance: "75.00",
              balance_state: "known",
            },
          });

        const result =
          await bootstrapTelecelMerchantWallet(
            {},
            {
              agentId: "user-1",
              simIccid: "iccid-1",
              simSlot: 1,
            },
          );

        expect(
          result.merchantAccount.current_balance,
        ).toBe("25.00");

        expect(
          result.workingAccount.current_balance,
        ).toBe("75.00");
      },
    );

    test(
      "rejects an invalid provenance state",
      async () => {
        getOrCreateTelecelMerchantWallet
          .mockResolvedValue({
            simWallet: {
              id: "wallet-1",
            },
            merchantAccount: {
              balance_state: "fabricated",
            },
            workingAccount: {
              balance_state: "unknown",
            },
          });

        await expect(
          bootstrapTelecelMerchantWallet(
            {},
            {
              agentId: "user-1",
              simIccid: "iccid-1",
              simSlot: 1,
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_BALANCE_STATE_INVALID",
        });
      },
    );
  },
);
