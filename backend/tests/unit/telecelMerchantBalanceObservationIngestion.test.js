const fs = require("fs");
const path = require("path");

const controllerPath = path.join(
  __dirname,
  "../../src/controllers/telecelMerchantBalanceObservationController.js",
);

const routePath = path.join(
  __dirname,
  "../../src/routes/transaction.routes.js",
);

const walletServicePath = path.join(
  __dirname,
  "../../src/services/telecelMerchantObservationWalletService.js",
);

const controller = fs.readFileSync(controllerPath, "utf8");
const routes = fs.readFileSync(routePath, "utf8");
const walletService = fs.readFileSync(
  walletServicePath,
  "utf8",
);

describe(
  "Telecel Merchant balance observation ingestion contract",
  () => {
    test(
      "route is protected by existing Business transaction auth boundary",
      () => {
        expect(routes).toContain(
          'router.use(authenticate)',
        );
        expect(routes).toContain(
          'router.use(requireActiveSubscription)',
        );
        expect(routes).toContain(
          '"/telecel-merchant/balance-observations"',
        );
        expect(routes).toContain(
          'authorize(',
        );
      },
    );

    test(
      "client cannot select financial wallet",
      () => {
        expect(routes).toContain(
          'body("sim_wallet_id")',
        );
        expect(routes).toContain(
          '.not()',
        );
        expect(routes).toContain(
          '"sim_wallet_id must not be supplied"',
        );

        expect(controller).not.toMatch(
          /req\.body\.sim_wallet_id/,
        );
      },
    );

    test(
      "observation source is server controlled",
      () => {
        expect(routes).toContain(
          'body("source")',
        );
        expect(routes).toContain(
          '"source is server controlled"',
        );

        expect(controller).toContain(
          'source: "telecel_balance_sms"',
        );
      },
    );

    test(
      "raw SMS is rejected and not required by controller",
      () => {
        expect(routes).toContain(
          'body("sms_body")',
        );
        expect(routes).toContain(
          '"raw SMS must not be submitted"',
        );

        expect(controller).not.toMatch(
          /req\.body\.sms_body/,
        );
      },
    );

    test(
      "Business SIM trust is checked as Telecel Merchant",
      () => {
        expect(controller).toContain(
          "verifyBusinessSimRoleAssignment",
        );
        expect(controller).toContain(
          'provider: "telecel"',
        );
        expect(controller).toContain(
          'claimedRole: "merchant"',
        );
      },
    );

    test(
      "wallet is derived from authenticated user identity",
      () => {
        expect(controller).toContain(
          "const agentId = req.user.id",
        );
        expect(controller).toContain(
          "resolveExistingTelecelMerchantWallet",
        );
        expect(controller).toContain(
          "agentId,",
        );
      },
    );

    test(
      "observation ingestion uses one database transaction",
      () => {
        expect(controller).toContain(
          "await withTransaction(",
        );
        expect(controller).toContain(
          "reconcileTelecelMerchantBalances(",
        );

        expect(controller).not.toMatch(
          /query\s*\(\s*["'`]COMMIT/i,
        );
        expect(controller).not.toMatch(
          /query\s*\(\s*["'`]ROLLBACK/i,
        );
      },
    );

    test(
      "observation path cannot create a wallet or balance account",
      () => {
        expect(walletService).not.toMatch(
          /INSERT\s+INTO\s+agent_sim_wallets/i,
        );
        expect(walletService).not.toMatch(
          /INSERT\s+INTO\s+sim_wallet_balance_accounts/i,
        );

        expect(walletService).toContain(
          "resolveExistingTelecelMerchantWallet",
        );
      },
    );

    test(
      "wallet lookup is locked to exact Telecel Merchant ownership",
      () => {
        expect(walletService).toContain(
          "agent_id = $1",
        );
        expect(walletService).toContain(
          "provider = 'telecel'",
        );
        expect(walletService).toContain(
          "sim_role = 'merchant'",
        );
        expect(walletService).toContain(
          "FOR UPDATE",
        );
      },
    );

    test(
      "identified path requires ICCID and observed SIM slot",
      () => {
        expect(walletService).toContain(
          "normalizedIccid.length > 0",
        );
        expect(walletService).toContain(
          "normalizedSlot !== null",
        );
        expect(walletService).toContain(
          "sim_iccid = $2",
        );
        expect(walletService).toContain(
          "last_known_sim_slot = $3",
        );
      },
    );

    test(
      "unresolved path requires complete device SIM tuple",
      () => {
        expect(walletService).toContain(
          "normalizedInstallationId.length > 0",
        );
        expect(walletService).toContain(
          "normalizedSubscriptionId !== null",
        );
        expect(walletService).toContain(
          "installation_id = $2",
        );
        expect(walletService).toContain(
          "sim_subscription_id = $3",
        );
        expect(walletService).toContain(
          "last_known_sim_slot = $4",
        );
      },
    );

    test(
      "response does not expose wallet or balance account identifiers",
      () => {
        const responseStart = controller.indexOf(
          "return res.status(200).json",
        );

        expect(responseStart).toBeGreaterThan(-1);

        const response = controller.slice(
          responseStart,
        );

        expect(response).toContain(
          "observation_id:",
        );
        expect(response).toContain(
          "idempotent_replay:",
        );
        expect(response).not.toContain(
          "simWalletId",
        );
        expect(response).not.toContain(
          "merchantAccount",
        );
        expect(response).not.toContain(
          "workingAccount",
        );
      },
    );
  },
);
