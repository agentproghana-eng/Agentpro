const fs = require('fs');
const path = require('path');

const routePath = path.join(
  __dirname,
  '../../src/routes/admin.routes.js'
);

const migrationPath = path.join(
  __dirname,
  '../../migrations/138_admin_audit_log_cursor_indexes.sql'
);

describe('Admin audit log cursor pagination contracts', () => {
  const source = fs.readFileSync(routePath, 'utf8');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  test('adds an additive cursor endpoint and preserves legacy audit endpoint', () => {
    expect(source).toContain(
      "router.get('/audit-logs/cursor'"
    );

    expect(source).toContain(
      "router.get('/audit-logs'"
    );
  });

  test('uses deterministic created_at and id ordering', () => {
    expect(source).toContain(
      'al.created_at DESC'
    );

    expect(source).toContain(
      'al.id DESC'
    );
  });

  test('uses seek pagination instead of offset in cursor route', () => {
    const start = source.indexOf(
      "router.get('/audit-logs/cursor'"
    );
    const end = source.indexOf(
      "router.get('/audit-logs'",
      start + 1
    );

    const cursorRoute = source.slice(
      start,
      end
    );

    expect(cursorRoute).toContain(
      'al.created_at <'
    );

    expect(cursorRoute).toContain(
      'AND al.id <'
    );

    expect(cursorRoute).not.toContain(
      ' OFFSET '
    );

    expect(cursorRoute).not.toContain(
      'COUNT(*)'
    );
  });

  test('uses limit plus one for has_more detection', () => {
    expect(source).toContain(
      'parsedLimit + 1'
    );

    expect(source).toContain(
      'has_more: hasMore'
    );

    expect(source).toContain(
      'next_cursor: nextCursor'
    );
  });

  test('preserves existing audit filters', () => {
    for (const filter of [
      'company_id',
      'user_id',
      'action',
      'from_date',
      'to_date',
    ]) {
      expect(source).toContain(filter);
    }
  });

  test('invalid cursors return the standard 422 contract', () => {
    expect(source).toContain(
      "code: 'INVALID_CURSOR'"
    );

    expect(source).toContain(
      'return res.status(422)'
    );
  });

  test('cursor is versioned and type-bound', () => {
    expect(source).toContain(
      "const AUDIT_CURSOR_KIND = 'audit_logs'"
    );

    expect(source).toContain(
      'v: 1'
    );
  });

  test('migration adds deterministic audit cursor indexes', () => {
    expect(migration).toContain(
      'idx_audit_logs_created_cursor'
    );

    expect(migration).toContain(
      'idx_audit_logs_company_created_cursor'
    );

    expect(migration).toContain(
      'idx_audit_logs_user_created_cursor'
    );

    expect(migration).toContain(
      'idx_audit_logs_action_created_cursor'
    );

    expect(migration).toContain(
      'created_at DESC, id DESC'
    );
  });
});
