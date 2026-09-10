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

async function main() {
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
