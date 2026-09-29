const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, "../../", relativePath),
    "utf8",
  );

describe("server-driven flow resolution convergence", () => {
  const capabilitySource = read(
    "src/utils/ussdFlowCapabilities.js",
  );
  const guardSource = read(
    "src/middleware/transactionCapability.js",
  );
  const catalogSource = read(
    "src/controllers/userController.js",
  );
  const transactionSource = read(
    "src/controllers/transactionController.js",
  );
  const flowControllerSource = read(
    "src/controllers/ussdFlowController.js",
  );

  test("initiation receives company identity from authenticated user", () => {
    expect(guardSource).toContain(
      "req.user?.company_id || null",
    );
    expect(guardSource).not.toContain(
      "req.body.company_id",
    );
  });

  test("business initiation accepts own company override or global fallback", () => {
    expect(capabilitySource).toContain(
      "f.company_id IS NULL",
    );
    expect(capabilitySource).toContain(
      "f.company_id = $7",
    );
    expect(capabilitySource).toContain(
      "f.business_sim_role = $4",
    );
    expect(capabilitySource).toContain(
      "f.owner_user_id IS NULL",
    );
  });

  test("personal initiation remains isolated from company flows", () => {
    expect(capabilitySource).toMatch(
      /\$3 = 'personal'[\s\S]*?f\.company_id IS NULL[\s\S]*?f\.business_sim_role IS NULL/,
    );
  });

  test("catalog uses exact business SIM role rather than legacy null-as-agent fallback", () => {
    expect(catalogSource).toContain(
      "f.business_sim_role = $2",
    );
    expect(catalogSource).not.toContain(
      "COALESCE(f.business_sim_role, 'agent') = $2",
    );
  });

  test("transaction execution delegates active-flow selection to the authoritative resolver", () => {
    expect(transactionSource).toContain(
      "resolveActiveTransactionFlow",
    );
    expect(transactionSource).toContain(
      'accountMode: "business"',
    );
    expect(transactionSource).toContain(
      "transactionType: transaction_type",
    );
  });

  test("runtime flow resolution delegates to the authoritative resolver", () => {
    expect(flowControllerSource).toContain(
      "resolveActiveTransactionFlow",
    );
    expect(flowControllerSource).toContain(
      'accountMode: "business"',
    );
    expect(flowControllerSource).toContain(
      "companyId: req.user.company_id || null",
    );
  });

  test("initiation never expands business eligibility to user-owned flows", () => {
    expect(capabilitySource).toContain(
      "f.owner_user_id IS NULL",
    );
    expect(capabilitySource).not.toContain(
      "f.owner_user_id =",
    );
  });
});
