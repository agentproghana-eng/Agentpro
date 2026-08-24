const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");

describe("Business transaction role execution contract", () => {
  const routes = read("src/routes/transaction.routes.js");

  const controller = read("src/controllers/transactionController.js");

  test("transaction route accepts only Business SIM roles", () => {
    expect(routes).toMatch(/body\(["']sim_role["']\)/);

    expect(routes).toMatch(
      /\.isIn\(\[\s*["']agent["'],\s*["']evd["'],\s*["']merchant["']\s*\]\)/,
    );
  });

  test("transaction initiation resolves a canonical Business role", () => {
    expect(controller).toContain("const businessSimRole =");

    expect(controller).toContain("INVALID_BUSINESS_SIM_ROLE");
  });

  test("server verifies persisted physical SIM role", () => {
    expect(controller).toContain("verifyBusinessSimRoleAssignment");

    expect(controller).toContain("roleVerification.ok === false");
  });

  test("legacy USSD templates are Agent-only", () => {
    expect(controller).toContain("AND $4 = 'agent'");
  });

  test("Flow Builder existence check uses exact role", () => {
    expect(controller).toContain("AND business_sim_role = $4");

    expect(controller).not.toContain(
      "COALESCE(business_sim_role, 'agent') = $4",
    );
  });

  test("transaction response reports role used for automation", () => {
    expect(controller).toContain("sim_role: businessSimRole");
  });

  test("financial runtime never defaults a missing role to Agent", () => {
    expect(controller).toContain('String(sim_role || "")');

    expect(controller).not.toContain('String(sim_role || "agent")');
  });
});
