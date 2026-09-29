const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, "../..", relativePath),
    "utf8",
  );

const capabilities = read(
  "src/utils/ussdFlowCapabilities.js",
);
const transactionController = read(
  "src/controllers/transactionController.js",
);
const ussdFlowController = read(
  "src/controllers/ussdFlowController.js",
);
const userController = read(
  "src/controllers/userController.js",
);
const adminRoutes = read(
  "src/routes/admin.routes.js",
);
const ciWorkflow = read(
  "../.github/workflows/ci.yml",
);

describe("server-driven production readiness contract", () => {
  test("one authoritative resolver owns active transaction flow selection", () => {
    expect(capabilities).toContain(
      "async function resolveActiveTransactionFlow({",
    );

    expect(transactionController).toContain(
      "resolveActiveTransactionFlow({",
    );
    expect(ussdFlowController).toContain(
      "resolveActiveTransactionFlow({",
    );

    expect(capabilities).toContain(
      "AND f.owner_user_id IS NULL",
    );
    expect(capabilities).toContain(
      "AND f.is_active = TRUE",
    );
  });

  test("Business resolution preserves authenticated company override and global fallback", () => {
    expect(capabilities).toContain(
      "AND f.business_sim_role = $4",
    );
    expect(capabilities).toContain(
      "f.company_id IS NULL",
    );
    expect(capabilities).toContain(
      "OR f.company_id = $7",
    );
    expect(capabilities).toContain(
      "WHEN $3 = 'business' AND f.company_id = $7",
    );

    expect(transactionController).toContain(
      "companyId,",
    );
    expect(ussdFlowController).toContain(
      "companyId: req.user.company_id || null",
    );
  });

  test("variant identity converges across initiation and runtime", () => {
    expect(capabilities).toContain(
      "COALESCE(f.bundle_category, '')",
    );
    expect(capabilities).toContain(
      "COALESCE(f.recipient_mode, '')",
    );

    expect(transactionController).toContain(
      "bundleCategory: bundle_category",
    );
    expect(transactionController).toContain(
      "recipientMode: recipient_mode",
    );

    expect(ussdFlowController).toContain(
      "bundleCategory: bundle_category",
    );
    expect(ussdFlowController).toContain(
      "recipientMode: recipient_mode",
    );
  });

  test("Personal resolution cannot consume company or Business-role flows", () => {
    expect(capabilities).toContain(
      "$3 = 'personal'",
    );
    expect(capabilities).toContain(
      "AND f.company_id IS NULL",
    );
    expect(capabilities).toContain(
      "AND f.business_sim_role IS NULL",
    );
  });

  test("V2 catalog fails closed when grouped variants disagree on form schema", () => {
    expect(userController).toContain(
      "const ambiguousV2Actions = new Set();",
    );
    expect(userController).toContain(
      "ambiguousV2Actions.add(actionKey);",
    );
    expect(userController).toContain(
      "ambiguousV2Actions.has(actionKey)",
    );
    expect(userController).toContain(
      "_form_schema_fingerprint",
    );
  });

  test("catalog exposes only global active non-user-owned flows", () => {
    expect(userController).toContain(
      "WHERE f.company_id IS NULL",
    );
    expect(userController).toContain(
      "AND f.owner_user_id IS NULL",
    );
    expect(userController).toContain(
      "AND f.is_active = TRUE",
    );
  });

  test("EVD remains fail closed for accounting and activation", () => {
    expect(transactionController).toContain(
      'code: "SIM_ROLE_ACCOUNTING_NOT_CONFIGURED"',
    );

    expect(adminRoutes).toContain(
      "flow.business_sim_role === 'evd'",
    );
    expect(adminRoutes).toContain(
      "USSD_SIM_ROLE_ACCOUNTING_NOT_READY",
    );
  });

  test("operator_id remains blocked from server-driven form activation", () => {
    expect(adminRoutes).toContain(
      "field?.key === 'operator_id'",
    );
    expect(adminRoutes).toContain(
      "USSD_FORM_FIELD_TRANSPORT_NOT_READY",
    );
  });

  test("CI supplies PostgreSQL-backed integration coverage", () => {
    expect(ciWorkflow).toContain(
      "postgresql://postgres:postgres@localhost:5432/agentpro_test",
    );
    expect(ciWorkflow).toContain(
      "Run integration tests",
    );
    expect(ciWorkflow).toContain(
      "npm test -- --testPathPattern=integration",
    );
  });

  test("production-readiness proof does not make remote posting policy programmable", () => {
    const forbiddenCatalogFields = [
      "posting_policy",
      "ledger_policy",
      "debit_account",
      "credit_account",
      "commission_policy",
    ];

    for (const field of forbiddenCatalogFields) {
      expect(userController).not.toContain(
        `form_fields: ${field}`,
      );
    }
  });
});
