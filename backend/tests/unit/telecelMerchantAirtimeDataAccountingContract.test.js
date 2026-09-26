const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/controllers/transactionController.js",
  ),
  "utf8",
);

const posting = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/services/telecelMerchantOutgoingPostingService.js",
  ),
  "utf8",
);

describe(
  "Telecel Merchant Airtime and Data accounting",
  () => {
    test(
      "both transaction types are validated Working Account outgoing types",
      () => {
        expect(posting).toContain('"airtime"');
        expect(posting).toContain('"data_bundle"');

        expect(controller).toContain(
          "isValidatedTelecelMerchantOutgoing",
        );
      },
    );

    test(
      "Merchant Airtime and Data use dedicated posting before Agent branches",
      () => {
        const merchant = controller.indexOf(
          'tx.provider === "telecel" &&\n' +
          '          tx.sim_role === "merchant"',
        );

        const agentAirtime = controller.indexOf(
          '} else if (tx.transaction_type === "airtime") {',
          merchant,
        );

        const agentData = controller.indexOf(
          '} else if (tx.transaction_type === "data_bundle") {',
          agentAirtime,
        );

        expect(merchant).toBeGreaterThan(-1);
        expect(agentAirtime).toBeGreaterThan(merchant);
        expect(agentData).toBeGreaterThan(agentAirtime);

        const merchantBranch = controller.slice(
          merchant,
          agentAirtime,
        );

        expect(merchantBranch).toContain(
          'tx.transaction_type === "airtime"',
        );
        expect(merchantBranch).toContain(
          'tx.transaction_type === "data_bundle"',
        );
        expect(merchantBranch).toContain(
          "postTelecelMerchantOutgoing(",
        );

        expect(merchantBranch).not.toContain(
          "postAirtime(",
        );
        expect(merchantBranch).not.toContain(
          "postDataBundle(",
        );
        expect(merchantBranch).not.toContain(
          "calculateAndPostCommission(",
        );
      },
    );

    test(
      "dedicated Merchant posting touches Working Account only",
      () => {
        expect(posting).toContain(
          "balance_code = 'working_account'",
        );

        expect(posting).not.toContain(
          "agent_cash_balances",
        );
        expect(posting).not.toContain(
          "cash_at_hand",
        );
        expect(posting).not.toContain(
          "agent_balance_movements",
        );
        expect(posting).not.toContain(
          "e_float_balance",
        );
        expect(posting).not.toContain(
          "commission_balance",
        );
      },
    );

    test(
      "unvalidated Merchant and EVD gate remains fail closed",
      () => {
        expect(controller).toContain(
          "SIM_ROLE_ACCOUNTING_NOT_CONFIGURED",
        );
      },
    );
  },
);
