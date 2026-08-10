const request = require('supertest');
const express = require('express');

jest.mock('../../src/middleware/auth', () => {
  const actual =
    jest.requireActual('../../src/middleware/auth');

  return {
    ...actual,

    // Authentication itself is outside this test's scope.
    // Supply a controlled authenticated user, but keep the
    // REAL authorize(...) middleware so route role rules are tested.
    authenticate: (req, _res, next) => {
      req.user = {
        id: 'financial-actor-1',
        company_id: 'company-1',
        role: req.get('x-test-role') || 'agent',
      };

      next();
    },
  };
});

jest.mock('../../src/controllers/balanceController', () => ({
  listPendingAdjustments: (_req, res) =>
    res.status(204).end(),

  getOwnCashBalance: (_req, res) =>
    res.status(204).end(),

  getOwnSimWalletBalance: (_req, res) =>
    res.status(204).end(),

  recordCashOutManual: (_req, res) =>
    res.status(204).end(),

  recordFloatReceived: (_req, res) =>
    res.status(204).end(),

  submitCashAdjustment: (_req, res) =>
    res.status(204).end(),

  reviewCashAdjustment: (_req, res) =>
    res.status(204).end(),
}));

const balanceRouter =
  require('../../src/routes/balance.routes');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use('/balances', balanceRouter);

  return app;
}

const endpoints = [
  {
    name: 'cash drawer',
    path: '/balances/cash-drawer',
  },
  {
    name: 'SIM wallet',
    path:
      '/balances/sim-wallet' +
      '?provider=mtn' +
      '&sim_iccid=8901000000000000001' +
      '&sim_slot=0',
  },
];

describe('My Balance read authorization', () => {
  const app = makeApp();

  test.each([
    'agent',
    'business_owner',
    'manager',
  ])(
    '%s can read own cash drawer',
    async (role) => {
      const response = await request(app)
        .get(endpoints[0].path)
        .set('x-test-role', role);

      expect(response.status).toBe(204);
    },
  );

  test.each([
    'agent',
    'business_owner',
    'manager',
  ])(
    '%s can read own exact SIM wallet',
    async (role) => {
      const response = await request(app)
        .get(endpoints[1].path)
        .set('x-test-role', role);

      expect(response.status).toBe(204);
    },
  );

  test.each(endpoints)(
    'auditor cannot read own $name through My Balance',
    async ({ path }) => {
      const response = await request(app)
        .get(path)
        .set('x-test-role', 'auditor');

      expect(response.status).toBe(403);

      expect(response.body).toEqual({
        success: false,
        message:
          'You do not have permission to access this resource',
      });
    },
  );
});
