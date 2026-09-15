const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../migrations/133_shift_global_cursor_index.sql'
  ),
  'utf8'
);

const shiftController = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../src/controllers/shiftController.js'
  ),
  'utf8'
);

describe('global shift cursor index contract', () => {
  test('adds a global closed-shift cursor index', () => {
    expect(migration).toContain(
      'CREATE INDEX IF NOT EXISTS idx_shifts_global_closed_cursor'
    );

    expect(migration).toMatch(
      /ON\s+shifts\s*\(\s*closed_at\s+DESC,\s*id\s+DESC\s*\)/i
    );

    expect(migration).toMatch(
      /WHERE\s+status\s*=\s*'closed'/i
    );
  });

  test('index ordering matches shift cursor ordering', () => {
    expect(shiftController).toMatch(
      /ORDER BY\s+s\.closed_at\s+DESC,\s*s\.id\s+DESC/i
    );
  });

  test('shift cursor uses tuple seek compatible with the index', () => {
    expect(shiftController).toMatch(
      /\(s\.closed_at,\s*s\.id\)\s*</i
    );
  });

  test('global index is intentionally not company scoped', () => {
    const indexDefinition =
      migration.match(
        /CREATE INDEX[\s\S]*?WHERE\s+status\s*=\s*'closed'/i
      )?.[0] || '';

    expect(indexDefinition).not.toMatch(/\bcompany_id\b/i);
    expect(indexDefinition).not.toMatch(/\bagent_id\b/i);
    expect(indexDefinition).not.toMatch(/\bbranch_id\b/i);
  });
});
