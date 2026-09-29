const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, "../../", relativePath),
    "utf8",
  );

describe("server-driven deterministic flow resolution", () => {
  const capability = read(
    "src/utils/ussdFlowCapabilities.js",
  );

  test("defines one authoritative exact active-flow resolver", () => {
    expect(capability).toContain(
      "resolveActiveTransactionFlow",
    );
    expect(capability).toContain(
      "f.owner_user_id IS NULL",
    );
    expect(capability).toContain(
      "f.is_active = TRUE",
    );
  });

  test("resolver uses exact variant identity", () => {
    expect(capability).toContain(
      "COALESCE(f.bundle_category, '')",
    );
    expect(capability).toContain(
      "COALESCE(f.recipient_mode, '')",
    );
  });

  test("Business resolution deterministically prefers company override", () => {
    expect(capability).toContain(
      "f.company_id = $7",
    );
    expect(capability).toMatch(
      /ORDER BY[\s\S]*CASE[\s\S]*f\.company_id = \$7[\s\S]*THEN 0[\s\S]*ELSE 1[\s\S]*END[\s\S]*LIMIT 1/,
    );
  });

  test("Personal resolution remains global and role-null", () => {
    expect(capability).toMatch(
      /\$3 = 'personal'[\s\S]*f\.company_id IS NULL[\s\S]*f\.business_sim_role IS NULL/,
    );
  });

  test("resolver never admits user-owned flows", () => {
    expect(capability).not.toContain(
      "f.owner_user_id = $",
    );
  });
});
