'use strict';

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function getAppliedFilenames(client) {
  const result = await client.query('SELECT filename FROM migrations_log ORDER BY filename');
  return new Set(result.rows.map(r => r.filename));
}

// Read-only status check - safe to call anytime, used to show an
// admin what WOULD happen before they commit to actually running it.
async function getMigrationStatus(client) {
  await ensureMigrationsTable(client);
  const files = listMigrationFiles();
  const appliedSet = await getAppliedFilenames(client);
  return files.map(file => ({ filename: file, applied: appliedSet.has(file) }));
}

// Applies every pending migration file, in order, each in its own
// transaction. This IS scripts/migrate.js's core logic, extracted so
// both the CLI script and the admin portal's "Run Pending Migrations"
// button execute the exact same code path, rather than two versions
// that could silently drift out of sync.
async function runMigrations(client) {
  await ensureMigrationsTable(client);
  const appliedSet = await getAppliedFilenames(client);
  const files = listMigrationFiles();

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO migrations_log (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed: ${file}`, err.message);
      throw Object.assign(
        new Error(`Migration ${file} failed: ${err.message}`),
        { failedFile: file, applied, skipped }
      );
    }
  }

  return { applied, skipped, total: applied.length };
}

module.exports = { runMigrations, getMigrationStatus, listMigrationFiles };
