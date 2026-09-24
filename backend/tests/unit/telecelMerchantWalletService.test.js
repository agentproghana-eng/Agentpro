const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/services/telecelMerchantWalletService.js",
  ),
  "utf8",
);

describe("Telecel Merchant wallet accounting boundary", () => {
  test("uses Merchant role rather than Agent role", () => {
    expect(service).toContain("sim_role = 'merchant'");
    expect(service).toContain("'merchant'");
  });

  test("is Telecel scoped", () => {
    expect(service).toContain("provider = 'telecel'");
    expect(service).toContain("'telecel'");
  });

  test("requires both validated active Merchant balances", () => {
    expect(service).toMatch(/["']merchant_account["']/);
    expect(service).toMatch(/["']working_account["']/);
    expect(service).toContain("is_validated = TRUE");
    expect(service).toContain("is_active = TRUE");
  });

  test("uses generic role-specific balance accounts", () => {
    expect(service).toContain("sim_wallet_balance_accounts");
  });

  test("does not use legacy Agent electronic balance columns", () => {
    expect(service).not.toContain("e_float_balance");
    expect(service).not.toContain("working_balance");
    expect(service).not.toContain("commission_balance");
  });

  test("does not touch physical cash", () => {
    expect(service).not.toContain("agent_cash_balances");
    expect(service).not.toContain("cash_at_hand");
    expect(service).not.toContain("getOrCreateAgentCashBalance");
  });

  test("keeps identified and unresolved SIM identities separate", () => {
    expect(service).toContain("'identified'");
    expect(service).toContain("'unresolved'");
    expect(service).toContain("sim_iccid");
    expect(service).toContain("installation_id");
    expect(service).toContain("sim_subscription_id");
    expect(service).toContain("last_known_sim_slot");
  });

  test("never creates legacy unassigned Merchant wallets", () => {
    expect(service).not.toContain("'legacy_unassigned'");
  });
});
