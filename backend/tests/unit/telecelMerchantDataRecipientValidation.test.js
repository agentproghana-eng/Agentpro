const request = require('supertest');
const express = require('express');

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent',
    };
    next();
  },

  requireActiveSubscription: (_req, _res, next) => {
    next();
  },

  authorize: () => (_req, _res, next) => {
    next();
  },
}));

jest.mock('../../src/middleware/transactionCapability', () => ({
  createInitiationCapabilityGuard: () =>
    (_req, _res, next) => {
      next();
    },
}));

jest.mock('../../src/controllers/transactionController', () => ({
  initiateTransaction: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
  completeTransaction: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
  listTransactions: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
  getRecoveryByOperation: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
  getTransaction: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
}));


const transactionRouter =
  require('../../src/routes/transaction.routes');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use('/transactions', transactionRouter);

  return app;
}

const base = {
  provider: 'telecel',
  transaction_type: 'data_bundle',
  client_operation_id: '9a38a665-7b23-4bc4-9338-b8f50bca7d03',
  amount: 0,
};

describe('Telecel data bundle recipient number', () => {
  const app = makeApp();

  test('Merchant Other requires the recipient number', async () => {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...base,
        sim_role: 'merchant',
        recipient_mode: 'other',
        customer_phone: '',
      });

    expect(response.status).toBe(422);
    expect(
      response.body.errors.some((e) => e.field === 'customer_phone'),
    ).toBe(true);
  });

  test('Merchant Other accepts a recipient number', async () => {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...base,
        sim_role: 'merchant',
        recipient_mode: 'other',
        customer_phone: '0241234567',
      });

    expect(response.status).toBe(204);
  });

  test('Merchant Self needs no recipient number', async () => {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...base,
        sim_role: 'merchant',
        recipient_mode: 'self',
        customer_phone: '',
      });

    expect(response.status).toBe(204);
  });

  test('Agent data bundle still needs no recipient number', async () => {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...base,
        sim_role: 'agent',
        customer_phone: '',
      });

    expect(response.status).toBe(204);
  });
});
