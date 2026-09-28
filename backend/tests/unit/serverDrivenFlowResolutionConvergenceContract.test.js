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
      "f.company_id = $5",
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
      /\$2 = 'personal'[\s\S]*?f\.company_id IS NULL[\s\S]*?f\.business_sim_role IS NULL/,
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

  test("transaction execution accepts own company override or global flow", () => {
    expect(transactionSource).toContain(
      "(company_id = $3 AND owner_user_id IS NULL)",
    );
    expect(transactionSource).toContain(
      "(company_id IS NULL AND owner_user_id IS NULL)",
    );
    expect(transactionSource).toContain(
      "business_sim_role = $4",
    );
  });

  test("flow resolver prefers company override and excludes personal ownership", () => {
    expect(flowControllerSource).toContain(
      "company_id = $1",
    );
    expect(flowControllerSource).toContain(
      "owner_user_id IS NULL",
    );
    expect(flowControllerSource).toContain(
      "business_sim_role = $4",
    );
    expect(flowControllerSource).toContain(
      "company_id IS NULL",
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
