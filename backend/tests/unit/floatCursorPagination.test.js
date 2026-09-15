const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const controller = fs.readFileSync(
  path.join(root, 'src/controllers/floatController.js'),
  'utf8'
);

const routes = fs.readFileSync(
  path.join(root, 'src/routes/float.routes.js'),
  'utf8'
);

const migration = fs.readFileSync(
  path.join(
    root,
    'migrations/134_float_cursor_indexes.sql'
  ),
  'utf8'
);

function functionBlock(name, nextMarker) {
  const start = controller.indexOf(
    `exports.${name} = async`
  );

  expect(start).toBeGreaterThanOrEqual(0);

  const end = controller.indexOf(
    nextMarker,
    start
  );

  expect(end).toBeGreaterThan(start);

  return controller.slice(start, end);
}

describe('float cursor pagination contract', () => {
  test('registers additive cursor routes', () => {
    expect(routes).toContain(
      "router.get('/history/cursor'"
    );

    expect(routes).toContain(
      'floatController.getFloatHistoryCursor'
    );

    expect(routes).toContain(
      "router.get('/requests/cursor'"
    );

    expect(routes).toContain(
      'floatController.listFloatRequestsCursor'
    );

    // Legacy compatibility routes remain.
    expect(routes).toContain(
      "router.get('/history'"
    );

    expect(routes).toContain(
      "router.get('/requests'"
    );
  });

  test('float movement cursor uses stable tuple seek without offset/count', () => {
    const block = functionBlock(
      'getFloatHistoryCursor',
      '// ── Update Low Float Threshold'
    );

    expect(block).toContain(
      '(fm.created_at, fm.id) <'
    );

    expect(block).toContain(
      'fm.created_at DESC'
    );

    expect(block).toContain(
      'fm.id DESC'
    );

    expect(block).toContain(
      'parsedLimit + 1'
    );

    expect(block).toContain(
      'next_cursor'
    );

    expect(block).toContain(
      'has_more'
    );

    expect(block).not.toContain(
      'OFFSET'
    );

    expect(block).not.toContain(
      'COUNT(*)'
    );
  });

  test('float request cursor uses stable tuple seek without offset/count', () => {
    const block = functionBlock(
      'listFloatRequestsCursor',
      '// ── Submit Float Request'
    );

    expect(block).toContain(
      '(fr.created_at, fr.id) <'
    );

    expect(block).toContain(
      'fr.created_at DESC'
    );

    expect(block).toContain(
      'fr.id DESC'
    );

    expect(block).toContain(
      'parsedLimit + 1'
    );

    expect(block).toContain(
      'next_cursor'
    );

    expect(block).toContain(
      'has_more'
    );

    expect(block).not.toContain(
      'OFFSET'
    );

    expect(block).not.toContain(
      'COUNT(*)'
    );
  });

  test('migration 134 provides global and scoped cursor indexes', () => {
    expect(migration).toContain(
      'idx_float_movements_created_cursor'
    );

    expect(migration).toContain(
      'idx_float_movements_account_created_cursor'
    );

    expect(migration).toContain(
      'idx_float_requests_created_cursor'
    );

    expect(migration).toContain(
      'idx_float_requests_branch_created_cursor'
    );

    expect(migration).toContain(
      'idx_float_requests_requester_created_cursor'
    );

    expect(migration).toContain(
      'created_at DESC'
    );

    expect(migration).toContain(
      'id DESC'
    );
  });

  test('malformed cursor contract returns 422 INVALID_CURSOR', () => {
    expect(controller).toContain(
      "code: 'INVALID_CURSOR'"
    );

    expect(controller).toContain(
      'return res.status(422).json'
    );
  });
});
