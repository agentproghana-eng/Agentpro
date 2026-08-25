const fs = require("fs");
const path = require("path");

const migrationPath = path.join(
  __dirname,
  "../../migrations/096_role_aware_sim_wallet_foundation.sql",
);

const migration = fs.readFileSync(migrationPath, "utf8");

describe("role-aware SIM wallet foundation migration", () => {
  test("adds an explicit SIM role to electronic wallet identity", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS sim_role TEXT");

    expect(migration).toContain("SET sim_role = 'agent'");

    expect(migration).toContain("ALTER COLUMN sim_role SET NOT NULL");
  });

  test("preserves the canonical role set", () => {
    for (const role of ["agent", "subscriber", "merchant", "evd"]) {
      expect(migration).toContain(`'${role}'`);
    }
  });

  test("keeps EVD restricted to MTN", () => {
    expect(migration).toContain("sim_role <> 'evd'");

    expect(migration).toContain("provider = 'mtn'");
  });

  test("keeps historical unassigned balances Agent-only", () => {
    expect(migration).toContain("identity_status <> 'legacy_unassigned'");

    expect(migration).toContain("OR sim_role = 'agent'");
  });

  test("makes identified wallet uniqueness role-aware", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX idx_agent_sim_wallet_identified[\s\S]*agent_id,[\s\S]*provider,[\s\S]*sim_role,[\s\S]*sim_iccid/,
    );
  });

  test("makes unresolved wallet uniqueness role-aware", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX idx_agent_sim_wallet_unresolved[\s\S]*agent_id,[\s\S]*provider,[\s\S]*sim_role,[\s\S]*installation_id,[\s\S]*sim_subscription_id,[\s\S]*last_known_sim_slot/,
    );
  });

  test("adds fail-closed balance capability definitions", () => {
    expect(migration).toContain("CREATE TABLE sim_wallet_balance_definitions");

    expect(migration).toContain(
      "is_validated          BOOLEAN NOT NULL DEFAULT FALSE",
    );

    expect(migration).toContain(
      "is_active             BOOLEAN NOT NULL DEFAULT FALSE",
    );

    expect(migration).toContain("is_active = FALSE");

    expect(migration).toContain("OR is_validated = TRUE");
  });

  test("adds generic balance accounts and movement history", () => {
    expect(migration).toContain("CREATE TABLE sim_wallet_balance_accounts");

    expect(migration).toContain("CREATE TABLE sim_wallet_balance_movements");

    expect(migration).toContain("current_balance >= 0");

    expect(migration).toContain("closing_balance >= 0");
  });

  test("persists Business SIM role without rewriting history", () => {
    expect(migration).toContain("ALTER TABLE transactions");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS sim_role TEXT");

    expect(migration).toContain("chk_transactions_business_sim_role");

    expect(migration).toContain("chk_transactions_sim_role_provider");

    expect(migration).toContain("sim_role IS NULL");

    expect(migration).toContain("sim_role <> 'evd'");

    expect(migration).toContain("provider = 'mtn'");

    expect(migration).not.toMatch(
      /UPDATE\s+transactions[\s\S]{0,200}SET\s+sim_role/i,
    );
  });

  test("does not seed fabricated Merchant or EVD balances", () => {
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+sim_wallet_balance_accounts/i,
    );

    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+sim_wallet_balance_movements/i,
    );
  });
});
