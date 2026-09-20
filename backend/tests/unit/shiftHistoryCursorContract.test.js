const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/controllers/shiftController.js'
  ),
  'utf8'
);

const routes = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/routes/shift.routes.js'
  ),
  'utf8'
);

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/132_shift_history_cursor_indexes.sql'
  ),
  'utf8'
);

describe('shift history cursor contract', () => {
  test('registers protected cursor route for operations and business scopes', () => {
    expect(routes).toContain(
      'requireShiftListAccess'
    );
    expect(routes).toContain(
      "'admin_operations'"
    );
    expect(routes).toContain(
      'shiftController.listShiftsCursor'
    );
  });

  test('uses descending closed_at/id seek pagination', () => {
    expect(controller).toContain(
      '(s.closed_at, s.id) <'
    );
    expect(controller).toContain(
      's.closed_at DESC'
    );
    expect(controller).toContain(
      's.id DESC'
    );
  });

  test('does not count rows in cursor handler', () => {
    const start = controller.indexOf(
      'exports.listShiftsCursor'
    );
    const end = controller.indexOf(
      'exports.listShifts =',
      start
    );
    const handler =
      controller.slice(start, end);

    expect(handler).not.toContain(
      'COUNT(*)'
    );
    expect(handler).not.toContain(
      'OFFSET'
    );
  });

  test('retains manager/company/filter scoping', () => {
    const start = controller.indexOf(
      'exports.listShiftsCursor'
    );
    const end = controller.indexOf(
      'exports.listShifts =',
      start
    );
    const handler =
      controller.slice(start, end);

    expect(handler).toContain(
      "hasAdminRole("
    );
    expect(handler).toContain(
      "req.user.role === 'manager'"
    );
    expect(handler).toContain(
      's.agent_id'
    );
    expect(handler).toContain(
      's.branch_id'
    );
    expect(handler).toContain(
      "flagged_only === 'true'"
    );
  });

  test('legacy list endpoint gives Operations Admin the same platform read scope', () => {
    const start = controller.indexOf(
      'exports.listShifts ='
    );
    const handler =
      controller.slice(start);

    expect(handler).toContain(
      "'admin_operations'"
    );
    expect(handler).toContain(
      'hasAdminRole('
    );
    expect(handler).toContain(
      's.company_id'
    );
  });

  test('adds cursor indexes with id tie breaker', () => {
    expect(migration).toContain(
      'idx_shifts_company_closed_cursor'
    );
    expect(migration).toContain(
      'idx_shifts_agent_closed_cursor'
    );
    expect(migration).toContain(
      'idx_shifts_branch_closed_cursor'
    );
    expect(migration).toContain(
      'closed_at DESC'
    );
    expect(migration).toContain(
      'id DESC'
    );
    expect(migration).toContain(
      "WHERE status = 'closed'"
    );
  });
});
