const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

const migration = fs.readFileSync(
  path.join(
    root,
    "migrations/163_server_driven_transaction_form_schema.sql",
  ),
  "utf8",
);

const controller = fs.readFileSync(
  path.join(root, "src/controllers/userController.js"),
  "utf8",
);

describe("server-driven transaction form schema V2", () => {
  test("stores form metadata on the authoritative USSD flow", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS form_schema JSONB",
    );
    expect(migration).toContain(
      "jsonb_typeof(form_schema) = 'array'",
    );
  });

  test("keeps form metadata separate from financial posting and PIN", () => {
    expect(migration).toContain(
      "Presentation/input metadata only",
    );
    expect(migration).toContain(
      "never financial posting policy or PIN collection",
    );
  });

  test("catalog selects normalized form schema from the role-scoped USSD flow", () => {
    expect(controller).toContain(
      "const currentFormSchema = normalizedFormSchema(row.form_schema)",
    );
    expect(controller).toContain(
      "form_fields: currentFormSchema",
    );
  });

  test("catalog normalizes persisted form schema and fails closed on ambiguous grouped variants", () => {
    expect(controller).toContain(
      "Array.isArray(rawSchema) ? rawSchema : []",
    );
    expect(controller).toContain(
      "ambiguousV2Actions.add(actionKey)",
    );
    expect(controller).toContain(
      "ambiguousV2Actions.has(actionKey)",
    );
  });

  test("defaults legacy clients to schema V1 and accepts explicit V2", () => {
    expect(controller).toContain(
      "rawSchemaVersion === undefined || rawSchemaVersion === null",
    );
    expect(controller).toContain(
      "![1, 2].includes(requestedSchemaVersion)",
    );
    expect(controller).toContain(
      "schema_version: requestedSchemaVersion",
    );
  });


  test("existing role isolation remains in the catalog query", () => {
    expect(controller).toContain(
      "f.business_sim_role = $2",
    );
  });
});
