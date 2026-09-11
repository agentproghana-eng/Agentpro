#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { Client } = require('pg');
const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(
    command,
    args,
    {
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function bootstrapCleanDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query(`
      INSERT INTO users (
        role,
        first_name,
        last_name,
        email,
        password_hash,
        status
      )
      VALUES (
        'superuser',
        'LoadTest',
        'Migration',
        'loadtest-migration@agentpro.invalid',
        crypt(
          gen_random_uuid()::text,
          gen_salt('bf')
        ),
        'active'
      )
      ON CONFLICT (email) DO NOTHING
    `);

    await client.query(
      `
        DELETE FROM migrations_log
        WHERE filename = $1
      `,
      [
        '075_seed_mtn_personal_send_money_same_network_flow.sql',
      ]
    );
  } finally {
    await client.end();
  }
}

async function ensureLoadTestUser() {
  const password = process.env.AGENTPRO_LOADTEST_PASSWORD;

  if (!password || password.length < 24) {
    throw new Error(
      'AGENTPRO_LOADTEST_PASSWORD must be at least 24 characters'
    );
  }

  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET.length < 32 ||
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET.length < 32
  ) {
    throw new Error(
      'Dedicated staging JWT secrets are required'
    );
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const companyResult = await client.query(
      `
        INSERT INTO companies (
          name,
          phone,
          email,
          status
        )
        VALUES (
          'AgentPro Load Test',
          '0000000000',
          'loadtest-company@agentpro.invalid',
          'active'
        )
        ON CONFLICT (email)
        DO UPDATE SET
          status = 'active',
          updated_at = NOW()
        RETURNING id
      `
    );

    const companyId = companyResult.rows[0].id;

    await client.query(
      `
        INSERT INTO users (
          company_id,
          role,
          first_name,
          last_name,
          email,
          password_hash,
          status,
          must_change_password
        )
        VALUES (
          $1,
          'agent',
          'LoadTest',
          'Capacity',
          'loadtest-capacity@agentpro.invalid',
          crypt($2, gen_salt('bf')),
          'active',
          FALSE
        )
        ON CONFLICT (email)
        DO UPDATE SET
          company_id = EXCLUDED.company_id,
          role = 'agent',
          password_hash = crypt(
            $2,
            gen_salt('bf')
          ),
          status = 'active',
          must_change_password = FALSE
      `,
      [companyId, password]
    );

    const subscriptionResult = await client.query(
      `
        SELECT id
        FROM subscriptions
        WHERE company_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [companyId]
    );

    if (subscriptionResult.rows.length === 0) {
      await client.query(
        `
          INSERT INTO subscriptions (
            company_id,
            plan,
            status,
            started_at,
            expires_at
          )
          VALUES (
            $1,
            'free',
            'active',
            NOW(),
            NOW() + INTERVAL '30 days'
          )
        `,
        [companyId]
      );
    } else {
      await client.query(
        `
          UPDATE subscriptions
          SET
            plan = 'free',
            status = 'active',
            started_at = COALESCE(
              started_at,
              NOW()
            ),
            expires_at =
              NOW() + INTERVAL '30 days',
            updated_at = NOW()
          WHERE id = $1
        `,
        [subscriptionResult.rows[0].id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    'Dedicated staging load-test agent ready'
  );
}

async function main() {
  // Free isolated staging has no dedicated Redis allocation.
  // Prevent ioredis from creating a localhost reconnecting client,
  // which would otherwise add retry latency to every authenticated
  // request. PostgreSQL remains the durable session authority.
  if (
    process.env.AGENTPRO_LOADTEST_ENV === 'isolated-staging'
  ) {
    process.env.AGENTPRO_DISABLE_REDIS = 'true';
  }
  if (
    process.env.AGENTPRO_LOADTEST_ENV !==
    'isolated-staging'
  ) {
    throw new Error(
      'Load-test startup requires AGENTPRO_LOADTEST_ENV=isolated-staging'
    );
  }

  console.log(
    'Running initial isolated staging migrations'
  );

  const first = spawnSync(
    process.execPath,
    ['scripts/migrate.js'],
    {
      encoding: 'utf8',
      env: process.env,
    }
  );

  const output =
    `${first.stdout || ''}${first.stderr || ''}`;

  process.stdout.write(output);

  if (first.status !== 0) {
    const expected =
      output.includes(
        '077_seed_mtn_personal_send_money_cross_network_flow.sql'
      ) &&
      output.includes(
        'Cannot seed MTN Personal cross-network USSD flow: no superuser exists'
      );

    if (!expected) {
      process.exit(first.status || 1);
    }

    console.log(
      'Known clean-database bootstrap condition detected'
    );

    await bootstrapCleanDatabase();

    console.log(
      'Ephemeral migration superuser created'
    );

    run(
      process.execPath,
      ['scripts/migrate.js']
    );
  }

  console.log(
    'Isolated staging migrations complete'
  );

  await ensureLoadTestUser();

  run(
    process.execPath,
    ['server.js']
  );
}

main().catch((error) => {
  console.error(
    'Load-test staging startup failed:',
    error.message
  );
  process.exit(1);
});
