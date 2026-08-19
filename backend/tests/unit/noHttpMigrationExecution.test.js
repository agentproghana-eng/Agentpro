'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');

const read = (...parts) =>
  fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

describe('HTTP database migration execution boundary', () => {
  const adminRoutes = read(
    'backend',
    'src',
    'routes',
    'admin.routes.js',
  );

  const adminPortal = read(
    'admin_portal',
    'src',
    'App.jsx',
  );

  const migrationService = read(
    'backend',
    'src',
    'services',
    'migrationService.js',
  );

  const migrateScript = read(
    'backend',
    'scripts',
    'migrate.js',
  );

  const packageJson = JSON.parse(
    read('backend', 'package.json'),
  );

  test('Admin HTTP routes cannot run or expose migration operations', () => {
    expect(adminRoutes).not.toMatch(
      /router\.(?:get|post|put|patch|delete)\(\s*['"`]\/migrations\//i,
    );

    expect(adminRoutes).not.toContain(
      "require('../services/migrationService')",
    );

    expect(adminRoutes).not.toContain('runMigrations');
    expect(adminRoutes).not.toContain('getMigrationStatus');
  });

  test('Admin Portal has no database migration controls', () => {
    expect(adminPortal).not.toContain('/admin/migrations/status');
    expect(adminPortal).not.toContain('/admin/migrations/run');
    expect(adminPortal).not.toContain('Run Pending Migrations');
    expect(adminPortal).not.toContain('Database Migrations');
  });

  test('migration execution remains available only to deployment CLI', () => {
    expect(migrationService).toContain(
      'async function runMigrations(client)',
    );

    expect(migrationService).not.toContain(
      'async function getMigrationStatus(client)',
    );

    expect(migrateScript).toContain(
      "require('../src/services/migrationService')",
    );

    expect(migrateScript).toContain('runMigrations(client)');

    expect(packageJson.scripts.migrate).toBe(
      'node scripts/migrate.js',
    );

    expect(packageJson.scripts.start).toContain(
      'npm run migrate',
    );
  });
});
