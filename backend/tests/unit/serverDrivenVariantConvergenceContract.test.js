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
      "COALESCE($7, '')",
    );
  });

  test("business transaction preflight uses the same exact variant dimensions", () => {
    expect(transactionController).toContain(
      "COALESCE(bundle_category, '') = COALESCE($5, '')",
    );
    expect(transactionController).toContain(
      "COALESCE(recipient_mode, '') = COALESCE($6, '')",
    );
    expect(transactionController).toContain(
      "bundle_category || null",
    );
    expect(transactionController).toContain(
      "recipient_mode || null",
    );
  });

  test("runtime resolver remains exact on both variant dimensions", () => {
    expect(flowController).toContain(
      "COALESCE(bundle_category,'') = COALESCE($5,'')",
    );
    expect(flowController).toContain(
      "COALESCE(recipient_mode,'') = COALESCE($6,'')",
    );
    expect(flowController).toContain(
      "COALESCE(bundle_category,'') = COALESCE($4,'')",
    );
    expect(flowController).toContain(
      "COALESCE(recipient_mode,'') = COALESCE($5,'')",
    );
  });

  test("variant hardening does not expand business execution to user-owned flows", () => {
    expect(capabilityUtility).toContain(
      "f.owner_user_id IS NULL",
    );
    expect(transactionController).toContain(
      "company_id = $3 AND owner_user_id IS NULL",
    );
    expect(transactionController).toContain(
      "company_id IS NULL AND owner_user_id IS NULL",
    );
  });
});
