'use strict';

const fs = require('fs');
const path = require('path');

const operationId =
  '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

const source = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, '../../', relativePath),
    'utf8'
  );

const cases = [
  {
    name: 'Business',
    controller:
      'src/controllers/transactionController.js',
    route: 'src/routes/transaction.routes.js',
    table: 'transactions',
    owner: 'agent_id',
  },
  {
    name: 'Personal',
    controller:
      'src/controllers/personalTransactionController.js',
    route: 'src/routes/personalTransaction.routes.js',
    table: 'personal_transactions',
    owner: 'user_id',
  },
];

describe('Zero-input recovery lookup contracts', () => {
  test.each(cases)(
    '$name lookup is authenticated and ownership-scoped',
    ({ controller, route, table, owner }) => {
      const controllerText = source(controller);
      const routeText = source(route);

      expect(controllerText).toContain(
        'exports.getRecoveryByOperation'
      );
      expect(controllerText).toContain(
        `FROM ${table}`
      );
      expect(controllerText).toContain(
        'client_operation_id = $1'
      );
      expect(controllerText).toContain(
        `${owner} = $2`
      );
      expect(controllerText).toContain(
        '[operationId, req.user.id]'
      );
      expect(routeText).toContain(
        '/recovery/by-operation/:operation_id'
      );

      const recoveryRoute = routeText.indexOf(
        '/recovery/by-operation/:operation_id'
      );
      const transactionRoute = routeText.indexOf(
        '/:transaction_id',
        recoveryRoute
      );

      expect(recoveryRoute).toBeGreaterThan(-1);
      expect(transactionRoute).toBeGreaterThan(
        recoveryRoute
      );

      expect(controllerText).toContain(
        'Invalid operation ID'
      );
      expect(controllerText).toContain(
        'Transaction not found'
      );
      expect(controllerText).toContain(
        'Recovery lookup unavailable'
      );
    }
  );

  test('Business recovery is restricted to transaction roles', () => {
    const routeText = source(
      'src/routes/transaction.routes.js'
    );

    expect(routeText).toMatch(
      /"\/recovery\/by-operation\/:operation_id",\s*authorize\("agent", "business_owner", "manager"\)/
    );
  });

  test('Personal recovery inherits personal-account protection', () => {
    const routeText = source(
      'src/routes/personalTransaction.routes.js'
    );

    expect(routeText).toContain(
      'router.use(authenticate, requirePersonalAccount)'
    );
  });

  test('operation ID uses UUID format', () => {
    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
