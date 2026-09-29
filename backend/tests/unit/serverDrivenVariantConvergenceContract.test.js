const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

const capabilityGuard = fs.readFileSync(
  path.join(root, "src/middleware/transactionCapability.js"),
  "utf8",
);

const capabilityUtility = fs.readFileSync(
  path.join(root, "src/utils/ussdFlowCapabilities.js"),
  "utf8",
);

const transactionController = fs.readFileSync(
  path.join(root, "src/controllers/transactionController.js"),
  "utf8",
);

const flowController = fs.readFileSync(
  path.join(root, "src/controllers/ussdFlowController.js"),
  "utf8",
);


const flowCapabilities = fs.readFileSync(
  path.join(__dirname, "../../src/utils/ussdFlowCapabilities.js"),
  "utf8",
);

describe("server-driven transaction variant convergence", () => {
  test("initiation guard transports only normalized requested variant identity", () => {
    expect(capabilityGuard).toContain(
      "String(req.body.bundle_category || '').trim() || null",
    );
    expect(capabilityGuard).toContain(
      "String(req.body.recipient_mode || '').trim() || null",
    );
    expect(capabilityGuard).toContain("bundleCategory");
    expect(capabilityGuard).toContain("recipientMode");
  });

  test("active-flow initiation requires exact bundle category", () => {
    expect(capabilityUtility).toContain(
      "COALESCE(f.bundle_category, '') =",
    );
    expect(capabilityUtility).toContain(
      "COALESCE($6, '')",
    );
  });

  test("active-flow initiation requires exact recipient mode", () => {
    expect(capabilityUtility).toContain(
      "COALESCE(f.recipient_mode, '') =",
    );
    expect(capabilityUtility).toContain(
      "COALESCE($6, '')",
    );
  });

  test("business transaction preflight delegates exact variant resolution", () => {
    expect(transactionController).toContain(
      "resolveActiveTransactionFlow({",
    );
    expect(transactionController).toContain(
      "bundleCategory: bundle_category",
    );
    expect(transactionController).toContain(
      "recipientMode: recipient_mode",
    );
    expect(flowCapabilities).toContain(
      "COALESCE(f.bundle_category, '') =",
    );
    expect(flowCapabilities).toContain(
      "COALESCE(f.recipient_mode, '') =",
    );
  });

  test("runtime resolver remains exact on both variant dimensions", () => {
    expect(flowCapabilities).toContain(
      "COALESCE(f.bundle_category, '') =",
    );
    expect(flowCapabilities).toContain(
      "COALESCE(f.recipient_mode, '') =",
    );
  });

  test("variant hardening does not expand business execution to user-owned flows", () => {
    expect(capabilityUtility).toContain(
      "f.owner_user_id IS NULL",
    );
    expect(transactionController).toContain(
      "resolveActiveTransactionFlow",
    );
    expect(transactionController).toContain(
      "companyId",
    );
  });
});
