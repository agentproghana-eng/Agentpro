const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/controllers/transactionController.js",
  ),
  "utf8",
);

describe(
  "Telecel Merchant outgoing controller boundary",
  () => {
    test(
      "imports dedicated readiness and posting services",
      () => {
        expect(controller).toContain(
          'require("../services/telecelMerchantOutgoingReadinessService")',
        );

        expect(controller).toContain(
          'require("../services/telecelMerchantOutgoingPostingService")',
        );
      },
    );

    test(
      "outgoing eligibility is exact Telecel Merchant scope",
      () => {
        expect(controller).toContain(
          "isValidatedTelecelMerchantOutgoing",
        );

        expect(controller).toContain(
          '"send_money_same_network"',
        );
        expect(controller).toContain(
          '"send_money_cross_network"',
        );
        expect(controller).toContain(
          '"send_money_to_bank"',
        );
      },
    );

    test(
      "outgoing payments require dedicated readiness before general preflight",
      () => {
        const readiness = controller.indexOf(
          "requireTelecelMerchantOutgoingReadiness(client",
        );

        const preflight = controller.indexOf(
          "Run independent transaction preflight queries concurrently",
        );

        expect(readiness).toBeGreaterThan(-1);
        expect(preflight).toBeGreaterThan(readiness);
      },
    );

    test(
      "successful outgoing completion dispatches dedicated posting",
      () => {
        expect(controller).toContain(
          "await postTelecelMerchantOutgoing(",
        );
      },
    );

    test(
      "Merchant outgoing branch does not dispatch Agent Send Money",
      () => {
        const start = controller.indexOf(
          'tx.provider === "telecel" &&\n' +
          '          tx.sim_role === "merchant" &&\n' +
          '          (\n' +
          '            tx.transaction_type === "airtime"',
        );

        const end = controller.indexOf(
          '} else if (tx.transaction_type === "airtime") {',
          start,
        );

        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);

        const branch = controller.slice(start, end);

        expect(branch).toContain(
          'tx.transaction_type === "airtime"',
        );
        expect(branch).toContain(
          'tx.transaction_type === "data_bundle"',
        );
        expect(branch).toContain(
          'tx.transaction_type === "send_money_same_network"',
        );
        expect(branch).toContain(
          'tx.transaction_type === "send_money_cross_network"',
        );
        expect(branch).toContain(
          'tx.transaction_type === "send_money_to_bank"',
        );
        expect(branch).toContain(
          "postTelecelMerchantOutgoing",
        );
        expect(branch).not.toContain(
          "postSendMoney(",
        );
        expect(branch).not.toContain(
          "postAirtime(",
        );
        expect(branch).not.toContain(
          "postDataBundle(",
        );
        expect(branch).not.toContain(
          "calculateAndPostCommission(",
        );
      },
    );

    test(
      "unvalidated Merchant and EVD gate remains fail-closed",
      () => {
        expect(controller).toContain(
          "SIM_ROLE_ACCOUNTING_NOT_CONFIGURED",
        );

        expect(controller).toContain(
          '["evd", "merchant"].includes(businessSimRole)',
        );
      },
    );
  },
);
