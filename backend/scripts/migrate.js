#!/usr/bin/env node
'use strict';

/**
 * Agent Pro Ghana — Database Migration Runner
 * Run: node scripts/migrate.js
 *
 * Applies all pending SQL migration files in order.
 * Tracks applied migrations in a migrations_log table.
 *
 * Core apply logic lives in src/services/migrationService.js, shared
 * with the admin portal's "Run Pending Migrations" button so both
 * paths execute the exact same code, not two versions that could
 * drift out of sync.
 */

require('dotenv').config();
const { Pool } = require('pg');
const { logger } = require('../src/utils/logger');
const { runMigrations } = require('../src/services/migrationService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const client = await pool.connect();
  try {
    const { applied, skipped, total } = await runMigrations(client);
    for (const file of skipped) {
      logger.info(`  ⏭  Skipping (already applied): ${file}`);
    }
    for (const file of applied) {
      logger.info(`  ✅ Applied: ${file}`);
    }
    if (total === 0) {
      logger.info('✅ Database is up to date — no migrations to apply');
    } else {
      logger.info(`✅ Applied ${total} migration(s) successfully`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  logger.error('Migration failed:', err);
  process.exit(1);
});
