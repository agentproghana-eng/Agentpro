const { Client } = require("pg");
const {
  resolveActiveTransactionFlow,
} = require("../../src/utils/ussdFlowCapabilities");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/agentpro_test";

describe("server-driven production readiness — PostgreSQL", () => {
  let client;
  let provider;
  let transactionType;
  let companyId;
  let ownerUserId;
  const insertedFlowIds = [];

  const queryFn = (...args) => client.query(...args);

  async function insertFlow({
    companyId: flowCompanyId = null,
    ownerUserId: flowOwnerUserId = null,
    businessSimRole = "merchant",
    bundleCategory = "stage10_default",
    recipientMode = "stage10_default",
    active = true,
  } = {}) {
    const result = await client.query(
      `INSERT INTO ussd_flows (
         provider,
         transaction_type,
         dial_code,
         is_active,
         company_id,
         owner_user_id,
         business_sim_role,
         bundle_category,
         recipient_mode,
         created_by
       )
       VALUES (
         $1::provider,
         $2::transaction_type,
         '*110#',
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9
       )
       RETURNING id`,
      [
        provider,
        transactionType,
        active,
        flowCompanyId,
        flowOwnerUserId,
        businessSimRole,
        bundleCategory,
        recipientMode,
        ownerUserId,
      ],
    );

    insertedFlowIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    const providerResult = await client.query(
      `SELECT e.enumlabel AS value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'provider'
       ORDER BY e.enumsortorder
       LIMIT 1`,
    );

    const transactionResult = await client.query(
      `SELECT e.enumlabel AS value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'transaction_type'
       ORDER BY e.enumsortorder
       LIMIT 1`,
    );

    expect(providerResult.rows.length).toBe(1);
    expect(transactionResult.rows.length).toBe(1);

    provider = providerResult.rows[0].value;
    transactionType = transactionResult.rows[0].value;

    const companyResult = await client.query(
      `INSERT INTO companies (
         name,
         phone,
         email,
         status
       )
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [
        `Stage 10 resolver company ${Date.now()}`,
        `+23320${String(Date.now()).slice(-7)}`,
        `stage10-company-${Date.now()}@agentpro.invalid`,
      ],
    );

    companyId = companyResult.rows[0].id;

    const userResult = await client.query(
      `INSERT INTO users (
         role,
         first_name,
         last_name,
         email,
         password_hash,
         status
       )
       VALUES (
         'superuser',
         'Stage10',
         'Resolver',
         $1,
         crypt(gen_random_uuid()::text, gen_salt('bf')),
         'active'
       )
       RETURNING id`,
      [
        `stage10-resolver-${Date.now()}@agentpro.invalid`,
      ],
    );

    ownerUserId = userResult.rows[0].id;
  });

  afterEach(async () => {
    if (insertedFlowIds.length === 0) {
      return;
    }

    await client.query(
      `DELETE FROM ussd_flow_steps
       WHERE flow_id = ANY($1::uuid[])`,
      [insertedFlowIds],
    );

    await client.query(
      `DELETE FROM ussd_flows
       WHERE id = ANY($1::uuid[])`,
      [insertedFlowIds],
    );

    insertedFlowIds.length = 0;
  });

  afterAll(async () => {
    if (!client) {
      return;
    }

    if (ownerUserId) {
      await client.query(
        "DELETE FROM users WHERE id = $1",
        [ownerUserId],
      );
    }

    if (companyId) {
      await client.query(
        "DELETE FROM companies WHERE id = $1",
        [companyId],
      );
    }

    await client.end();
  });

  test("authenticated company override wins over matching global flow", async () => {
    const globalId = await insertFlow();
    const companyIdFlow = await insertFlow({
      companyId,
    });

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider,
      transactionType,
      businessSimRole: "merchant",
      companyId,
      bundleCategory: "stage10_default",
      recipientMode: "stage10_default",
      queryFn,
    });

    expect(flow).not.toBeNull();
    expect(flow.id).toBe(companyIdFlow);
    expect(flow.id).not.toBe(globalId);
  });

  test("Business resolution falls back to the matching global flow", async () => {
    const globalId = await insertFlow();

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider,
      transactionType,
      businessSimRole: "merchant",
      companyId,
      bundleCategory: "stage10_default",
      recipientMode: "stage10_default",
      queryFn,
    });

    expect(flow).not.toBeNull();
    expect(flow.id).toBe(globalId);
  });

  test("variant identity is exact", async () => {
    await insertFlow({
      bundleCategory: "stage10_other",
      recipientMode: "stage10_other",
    });

    const expectedId = await insertFlow({
      bundleCategory: "stage10_bundle",
      recipientMode: "stage10_recipient",
    });

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider,
      transactionType,
      businessSimRole: "merchant",
      companyId,
      bundleCategory: "stage10_bundle",
      recipientMode: "stage10_recipient",
      queryFn,
    });

    expect(flow).not.toBeNull();
    expect(flow.id).toBe(expectedId);
  });

  test("inactive and user-owned flows are excluded", async () => {
    await insertFlow({
      active: false,
    });

    await insertFlow({
      ownerUserId,
    });

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider,
      transactionType,
      businessSimRole: "merchant",
      companyId,
      bundleCategory: "stage10_default",
      recipientMode: "stage10_default",
      queryFn,
    });

    expect(flow).toBeNull();
  });

  test("Personal resolution cannot consume Business flows", async () => {
    await insertFlow({
      businessSimRole: "merchant",
    });

    const flow = await resolveActiveTransactionFlow({
      accountMode: "personal",
      provider,
      transactionType,
      bundleCategory: "stage10_default",
      recipientMode: "stage10_default",
      queryFn,
    });

    expect(flow).toBeNull();
  });

  test("invalid Business role fails closed without database resolution", async () => {
    let queried = false;

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider,
      transactionType,
      businessSimRole: "unknown-role",
      companyId,
      queryFn: async (...args) => {
        queried = true;
        return client.query(...args);
      },
    });

    expect(flow).toBeNull();
    expect(queried).toBe(false);
  });
});
