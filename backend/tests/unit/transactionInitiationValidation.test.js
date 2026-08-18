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

  async function expectFieldRejected(payload, field) {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...validRequest,
        ...payload,
      });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);

    expect(
      response.body.errors.some(
        (error) => error.field === field,
      ),
    ).toBe(true);

    expect(
      transactionController.initiateTransaction,
    ).not.toHaveBeenCalled();

    return response;
  }

  async function expectAccepted(payload) {
    const response = await request(app)
      .post('/transactions')
      .send({
        ...validRequest,
        ...payload,
      });

    expect(response.status).toBe(204);

    expect(
      transactionController.initiateTransaction,
    ).toHaveBeenCalledTimes(1);

    return response;
  }

  test(
    'balance enquiry accepts omitted amount and customer',
    async () => {
      await expectAccepted({
        transaction_type: 'balance_enquiry',
      });
    },
  );

  test(
    'no-amount operations reject a fake positive amount',
    async () => {
      await expectFieldRejected(
        {
          transaction_type: 'balance_enquiry',
          amount: 5,
        },
        'amount',
      );
    },
  );

  test(
    'no-amount operations accept explicit zero from Flutter',
    async () => {
      await expectAccepted({
        transaction_type: 'mini_statement',
        amount: 0,
      });
    },
  );

  test(
    'Cash In requires a positive amount',
    async () => {
      await expectFieldRejected(
        {
          transaction_type: 'cash_in',
          customer_phone: '0240000000',
        },
        'amount',
      );
    },
  );

  test(
    'Cash In requires customer phone',
    async () => {
      await expectFieldRejected(
        {
          transaction_type: 'cash_in',
          amount: 10,
        },
        'customer_phone',
      );
    },
  );

  test(
    'valid Cash In reaches the controller',
    async () => {
      await expectAccepted({
        transaction_type: 'cash_in',
        amount: 10,
        customer_phone: '0240000000',
      });
    },
  );

  test(
    'Send Money requires recipient phone',
    async () => {
      await expectFieldRejected(
        {
          transaction_type: 'send_money',
          amount: 10,
        },
        'recipient_phone',
      );
    },
  );

  test(
    'valid Send Money reaches the controller without customer phone',
    async () => {
      await expectAccepted({
        transaction_type: 'send_money',
        amount: 10,
        recipient_phone: '0240000000',
      });
    },
  );

  test(
    'Pay to Agent requires customer phone',
    async () => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: 'bill_payment',
          amount: 10,
          payment_reference: 'FLOAT EXCHANGE',
        },
        'customer_phone',
      );
    },
  );

  test(
    'Pay to Agent requires reference',
    async () => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: 'bill_payment',
          amount: 10,
          customer_phone: '0240000000',
        },
        'payment_reference',
      );
    },
  );

  test(
    'valid Pay to Agent reaches the controller',
    async () => {
      await expectAccepted({
        provider: 'mtn',
        transaction_type: 'bill_payment',
        amount: 10,
        customer_phone: '0240000000',
        payment_reference: 'FLOAT EXCHANGE',
      });
    },
  );

  test(
    'Pay to Merchant requires merchant ID',
    async () => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: 'merchant_payment',
          amount: 10,
          payment_reference: 'SHOP STOCK',
        },
        'merchant_id',
      );
    },
  );

  test(
    'Pay to Merchant requires reference',
    async () => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: 'merchant_payment',
          amount: 10,
          merchant_id: '123456',
        },
        'payment_reference',
      );
    },
  );

  test(
    'valid Pay to Merchant reaches the controller',
    async () => {
      await expectAccepted({
        provider: 'mtn',
        transaction_type: 'merchant_payment',
        amount: 10,
        merchant_id: '123456',
        payment_reference: 'SHOP STOCK',
      });
    },
  );

  test(
    'MTN Data Bundle requires customer phone',
    async () => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: 'data_bundle',
          amount: 5,
        },
        'customer_phone',
      );
    },
  );

  test(
    'Telecel Data Bundle needs amount but no customer phone',
    async () => {
      await expectAccepted({
        provider: 'telecel',
        transaction_type: 'data_bundle',
        amount: 5,
      });
    },
  );

  test.each([
    'working_to_float',
    'float_to_working',
    'commission_transfer',
  ])(
    '%s requires amount but no customer phone',
    async (transactionType) => {
      await expectAccepted({
        provider: 'telecel',
        transaction_type: transactionType,
        amount: 10,
      });
    },
  );

  test.each([
    'business_deposit',
    'business_withdrawal',
    'reversal',
  ])(
    '%s requires customer phone',
    async (transactionType) => {
      await expectFieldRejected(
        {
          provider: 'mtn',
          transaction_type: transactionType,
          amount: 10,
        },
        'customer_phone',
      );
    },
  );
});
