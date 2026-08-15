const fs = require("fs");
const path = require("path");

describe("float account timestamp trigger migration", () => {
  const migrationPath = path.join(
    __dirname,
    "../../migrations/074_fix_float_accounts_timestamp_trigger.sql"
  );

  const migration = fs.readFileSync(
    migrationPath,
    "utf8"
  );

  test("moves float_accounts away from the incompatible generic trigger", () => {
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS trg_float_accounts_updated_at"
    );

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION update_float_accounts_last_updated_at()"
    );

    expect(migration).toContain(
      "NEW.last_updated_at = NOW();"
    );

    expect(migration).toContain(
      "EXECUTE FUNCTION update_float_accounts_last_updated_at();"
    );

    expect(migration).not.toContain(
      "NEW.updated_at = NOW();"
    );
  });

  test("recreates the trigger specifically on float_accounts", () => {
    expect(migration).toContain(
      "CREATE TRIGGER trg_float_accounts_updated_at"
    );

    expect(migration).toContain(
      "BEFORE UPDATE ON float_accounts"
    );
  });
});
