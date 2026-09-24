const { pool } = require("../../src/config/database");
const {
  reconcileTelecelMerchantBalances,
} = require("../../src/services/telecelMerchantBalanceReconciliationService");

describe("Telecel Merchant balance reconciliation rollback", () => {
  let client;

  beforeAll(async () => {
    const db = await pool.query(
      "SELECT current_database() AS name",
    );

    expect(db.rows[0].name).toBe("agentpro_test");
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
  });

  afterEach(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
      client = null;
    }
  });

  test(
    "rolls back the observation and first balance update when the second account update fails",
    async () => {
      const suffix = Date.now().toString();
      const companyId = (
        await client.query(
          `INSERT INTO companies (
             name,
             phone,
             status
           )
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`Telecel rollback ${suffix}`, `024${suffix.slice(-7)}`],
        )
      ).rows[0].id;

      const agentId = (
        await client.query(
          `INSERT INTO users (
             company_id,
             role,
             first_name,
             last_name,
             email,
             password_hash,
             status
           )
           VALUES (
             $1,
             'agent',
             'Rollback',
             'Agent',
             $2,
             'test-hash',
             'active'
           )
           RETURNING id`,
          [
            companyId,
            `telecel.rollback.${suffix}@example.com`,
          ],
        )
      ).rows[0].id;

      const walletId = (
        await client.query(
          `INSERT INTO agent_sim_wallets (
             agent_id,
             provider,
             sim_role,
             identity_status,
             sim_iccid,
             last_known_sim_slot
           )
           VALUES (
             $1,
             'telecel',
             'merchant',
             'identified',
             $2,
             1
           )
           RETURNING id`,
          [agentId, `rollback-${suffix}`],
        )
      ).rows[0].id;

      const accounts = await client.query(
        `INSERT INTO sim_wallet_balance_accounts (
           sim_wallet_id,
           balance_code,
           current_balance
         )
         VALUES
           ($1, 'merchant_account', 0),
           ($1, 'working_account', 0)
         RETURNING id, balance_code`,
        [walletId],
      );

      expect(accounts.rows).toHaveLength(2);

      /*
       * Force the second account update to fail after:
       *   1. the observation INSERT
       *   2. the merchant_account UPDATE
       *
       * The constraint is transaction-local because this entire test
       * itself is rolled back in afterEach.
       */
      await client.query(
        `ALTER TABLE sim_wallet_balance_accounts
           ADD CONSTRAINT test_fail_working_account_update
           CHECK (
             balance_code <> 'working_account'
             OR balance_state <> 'known'
           )
           NOT VALID`,
      );

      await client.query("SAVEPOINT before_reconciliation");

      let error;

      try {
        await reconcileTelecelMerchantBalances(
          client,
          {
            simWalletId: walletId,
            agentId,
            companyId,
            merchantAccountBalance: 25,
            workingAccountBalance: 75,
            source: "telecel_balance_sms",
            sourceReference:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            observedAt: new Date().toISOString(),
          },
        );

        throw new Error(
          "Expected reconciliation to fail",
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();

      /*
       * PostgreSQL marks the transaction failed after a constraint
       * violation, so return to the savepoint before inspecting state.
       */
      await client.query(
        "ROLLBACK TO SAVEPOINT before_reconciliation",
      );

      const observations = await client.query(
        `SELECT COUNT(*)::integer AS count
           FROM telecel_merchant_balance_observations
          WHERE sim_wallet_id = $1`,
        [walletId],
      );

      expect(observations.rows[0].count).toBe(0);

      const balances = await client.query(
        `SELECT
           balance_code,
           current_balance::text,
           balance_state,
           balance_source,
           balance_observed_at,
           balance_initialized_at
         FROM sim_wallet_balance_accounts
         WHERE sim_wallet_id = $1
         ORDER BY balance_code`,
        [walletId],
      );

      expect(balances.rows).toEqual([
        expect.objectContaining({
          balance_code: "merchant_account",
          current_balance: "0.00",
          balance_state: "unknown",
          balance_source: null,
          balance_observed_at: null,
          balance_initialized_at: null,
        }),
        expect.objectContaining({
          balance_code: "working_account",
          current_balance: "0.00",
          balance_state: "unknown",
          balance_source: null,
          balance_observed_at: null,
          balance_initialized_at: null,
        }),
      ]);

      const audits = await client.query(
        `SELECT COUNT(*)::integer AS count
           FROM audit_logs
          WHERE entity_id = $1
            AND action =
              'TELECEL_MERCHANT_BALANCES_RECONCILED'`,
        [walletId],
      );

      expect(audits.rows[0].count).toBe(0);

      await client.query(
        `ALTER TABLE sim_wallet_balance_accounts
           DROP CONSTRAINT test_fail_working_account_update`,
      );
    },
  );
});

describe("Telecel Merchant E-Cash posting rollback", () => {
  let client;

  const {
    postTelecelMerchantECash,
  } = require("../../src/services/telecelMerchantECashPostingService");

  beforeAll(async () => {
    const db = await pool.query(
      "SELECT current_database() AS name",
    );

    expect(db.rows[0].name).toBe("agentpro_test");
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
  });

  afterEach(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
      client = null;
    }
  });

  test(
    "rolls back the source debit when the later credit fails",
    async () => {
      const suffix =
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const companyId = (
        await client.query(
          `INSERT INTO companies (
             name,
             phone,
             status
           )
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`Telecel E-Cash rollback ${suffix}`, `025${suffix.slice(-7)}`],
        )
      ).rows[0].id;

      const agentId = (
        await client.query(
          `INSERT INTO users (
             company_id,
             role,
             first_name,
             last_name,
             email,
             password_hash,
             status
           )
           VALUES (
             $1,
             'agent',
             'E-Cash',
             'Rollback',
             $2,
             'test-hash',
             'active'
           )
           RETURNING id`,
          [
            companyId,
            `telecel.ecash.rollback.${suffix}@example.com`,
          ],
        )
      ).rows[0].id;

      const branchId = (
        await client.query(
          `INSERT INTO branches (
             company_id,
             name,
             status
           )
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [
            companyId,
            `Rollback Branch ${suffix}`,
          ],
        )
      ).rows[0].id;

      const simIccid = `ecash-rollback-${suffix}`;

      const walletId = (
        await client.query(
          `INSERT INTO agent_sim_wallets (
             agent_id,
             provider,
             sim_role,
             identity_status,
             sim_iccid,
             last_known_sim_slot
           )
           VALUES (
             $1,
             'telecel',
             'merchant',
             'identified',
             $2,
             1
           )
           RETURNING id`,
          [agentId, simIccid],
        )
      ).rows[0].id;

      const observedAt = new Date().toISOString();

      const accounts = await client.query(
        `INSERT INTO sim_wallet_balance_accounts (
           sim_wallet_id,
           balance_code,
           current_balance,
           balance_state,
           balance_source,
           balance_observed_at,
           balance_initialized_at
         )
         VALUES
           (
             $1,
             'merchant_account',
             100,
             'known',
             'telecel_balance_sms',
             $2,
             $2
           ),
           (
             $1,
             'working_account',
             50,
             'known',
             'telecel_balance_sms',
             $2,
             $2
           )
         RETURNING id, balance_code`,
        [walletId, observedAt],
      );

      expect(accounts.rows).toHaveLength(2);

      const transactionId = (
        await client.query(
          `INSERT INTO transactions (
             reference,
             agent_id,
             branch_id,
             company_id,
             provider,
             transaction_type,
             status,
             amount,
             sim_role,
             sim_iccid,
             sim_slot
           )
           VALUES (
             $1,
             $2,
             $3,
             $4,
             'telecel',
             'float_to_working',
             'initiated',
             20,
             'merchant',
             $5,
             1
           )
           RETURNING id`,
          [
            `TELECEL-ECASH-ROLLBACK-${suffix}`,
            agentId,
            branchId,
            companyId,
            simIccid,
          ],
        )
      ).rows[0].id;

      /*
       * Make only the Working Account credit impossible.
       * The Merchant Account debit therefore succeeds first,
       * and the second UPDATE raises a PostgreSQL constraint
       * violation.
       */
      await client.query(
        `ALTER TABLE sim_wallet_balance_accounts
           ADD CONSTRAINT test_fail_working_account_credit
           CHECK (
             balance_code <> 'working_account'
             OR current_balance <= 50
           )
           NOT VALID`,
      );

      await client.query(
        "SAVEPOINT before_ecash_posting",
      );

      let error;

      try {
        await postTelecelMerchantECash(
          client,
          {
            id: transactionId,
            provider: "telecel",
            sim_role: "merchant",
            transaction_type: "float_to_working",
            amount: 20,
            sim_iccid: simIccid,
            sim_slot: 1,
            installation_id: null,
            sim_subscription_id: null,
          },
          agentId,
        );

        throw new Error(
          "Expected E-Cash posting to fail",
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();

      /*
       * The failed SQL statement aborts the PostgreSQL
       * transaction. Restore it to the savepoint and verify
       * that the earlier debit disappeared as well.
       */
      await client.query(
        "ROLLBACK TO SAVEPOINT before_ecash_posting",
      );

      const balances = await client.query(
        `SELECT
           balance_code,
           current_balance::text
         FROM sim_wallet_balance_accounts
         WHERE sim_wallet_id = $1
         ORDER BY balance_code`,
        [walletId],
      );

      expect(balances.rows).toEqual([
        {
          balance_code: "merchant_account",
          current_balance: "100.00",
        },
        {
          balance_code: "working_account",
          current_balance: "50.00",
        },
      ]);

      const movements = await client.query(
        `SELECT COUNT(*)::integer AS count
           FROM sim_wallet_balance_movements
          WHERE transaction_id = $1`,
        [transactionId],
      );

      expect(movements.rows[0].count).toBe(0);

      const transaction = await client.query(
        `SELECT sim_wallet_id
           FROM transactions
          WHERE id = $1`,
        [transactionId],
      );

      expect(
        transaction.rows[0].sim_wallet_id,
      ).toBeNull();

      await client.query(
        `ALTER TABLE sim_wallet_balance_accounts
           DROP CONSTRAINT test_fail_working_account_credit`,
      );
    },
  );
});
