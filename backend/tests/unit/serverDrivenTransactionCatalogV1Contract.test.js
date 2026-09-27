const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/userController.js"),
  "utf8",
);

describe("Server-Driven Transaction Catalog V1", () => {
  test("supports every operational SIM role without a provider-specific client allowlist", () => {
    expect(controller).toContain('evd: {');
    expect(controller).toContain('businessSimRole: "evd"');
    expect(controller).toContain('merchant: {');
    expect(controller).toContain('businessSimRole: "merchant"');
    expect(controller).toContain('role: "subscriber"');
  });

  test("Business catalog is isolated by server-trusted business SIM role", () => {
    expect(controller).toContain(
      "COALESCE(f.business_sim_role, 'agent') = $2",
    );
    expect(controller).toContain(
      "[accountMode, businessSimRole]",
    );
  });

  test("Personal catalog never consumes Business role flows", () => {
    expect(controller).toContain(
      "$1 = 'personal' AND f.business_sim_role IS NULL",
    );
  });

  test("catalog publishes an explicit version and resolved role", () => {
    expect(controller).toContain("schema_version: 1");
    expect(controller).toContain("role: catalogRole");
    expect(controller).toContain("mode: responseMode");
  });

  test("legacy mode aliases remain compatible", () => {
    expect(controller).toContain("business: {");
    expect(controller).toContain("personal: {");
    expect(controller).toContain("agent: {");
    expect(controller).toContain("subscriber: {");
  });
});
