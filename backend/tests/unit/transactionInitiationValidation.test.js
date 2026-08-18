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
  getTransaction: jest.fn(
    (_req, res) => res.status(204).end(),
  ),
}));

const transactionController =
  require('../../src/controllers/transactionController');

const transactionRouter =
  require('../../src/routes/transaction.routes');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use('/transactions', transactionRouter);

  return app;
}

const validRequest = {
  provider: 'mtn',
  transaction_type: 'balance_enquiry',
  client_operation_id:
    '9a38a665-7b23-4bc4-9338-b8f50bca7d03',
};

describe('Business transaction initiation validation', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'rejects initiation when client_operation_id is missing',
    async () => {
      const {
        client_operation_id: _omitted,
        ...payload
      } = validRequest;

      const response = await request(app)
        .post('/transactions')
        .send(payload);

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) =>
            error.field === 'client_operation_id',
        ),
      ).toBe(true);

      expect(
        transactionController.initiateTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  test(
    'rejects malformed client_operation_id',
    async () => {
      const response = await request(app)
        .post('/transactions')
        .send({
          ...validRequest,
          client_operation_id: 'not-a-uuid',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) =>
            error.field === 'client_operation_id',
        ),
      ).toBe(true);

      expect(
        transactionController.initiateTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  test(
    'valid operation UUID reaches the controller',
    async () => {
      const response = await request(app)
        .post('/transactions')
        .send(validRequest);

      expect(response.status).toBe(204);

      expect(
        transactionController.initiateTransaction,
      ).toHaveBeenCalledTimes(1);
    },
  );
});
