const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/controllers/userSimPurposeController.js",
  ),
  "utf8",
);

const bootstrap = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/services/telecelMerchantWalletBootstrapService.js",
  ),
  "utf8",
);

const observation = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/services/telecelMerchantObservationWalletService.js",
  ),
  "utf8",
);

const readiness = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/services/telecelMerchantECashReadinessService.js",
  ),
  "utf8",
);

describe(
  "Telecel Merchant structural wallet bootstrap contract",
  () => {
    test(
      "bootstraps only from Telecel Merchant SIM-purpose save",
      () => {
        expect(controller).toContain(
          'provider === "telecel"',
        );
        expect(controller).toContain(
          'purpose === "merchant"',
        );
        expect(controller).toContain(
          "bootstrapTelecelMerchantWallet",
        );
      },
    );

    test(
      "bootstrap runs inside the existing SIM-purpose transaction",
      () => {
        expect(controller).toContain(
          "await withTransaction(async (client)",
        );
        expect(controller).toContain(
          "bootstrapTelecelMerchantWallet(\n            client,",
        );
      },
    );

    test(
      "bootstrap does not write monetary balances",
      () => {
        expect(bootstrap).not.toMatch(
          /current_balance\s*=/,
        );
        expect(bootstrap).not.toMatch(
          /UPDATE\s+sim_wallet_balance_accounts/i,
        );
        expect(bootstrap).not.toMatch(
          /INSERT\s+INTO\s+sim_wallet_balance_movements/i,
        );
      },
    );

    test(
      "observation and readiness remain lookup-only",
      () => {
        expect(observation).not.toContain(
          "getOrCreateTelecelMerchantWallet",
        );
        expect(readiness).not.toContain(
          "getOrCreateTelecelMerchantWallet",
        );
      },
    );
  },
);
