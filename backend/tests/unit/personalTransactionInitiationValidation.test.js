const request = require('supertest');
const express = require('express');

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'personal-user-1',
      role: 'personal',
    };
    next();
  },

  requirePersonalAccount: (_req, _res, next) => {
    next();
  },

  requirePaidPersonalPlan: (_req, _res, next) => {
    next();
  },
}));

jest.mock('../../src/middleware/transactionCapability', () => ({
  createInitiationCapabilityGuard: () =>
    (_req, _res, next) => {
      next();
    },
}));

jest.mock(
  '../../src/controllers/personalTransactionController',
  () => ({
    initiateTransaction: jest.fn(
      (_req, res) => res.status(204).end(),
    ),
    completeTransaction: jest.fn(
      (_req, res) => res.status(204).end(),
    ),
    listRecentTransactions: jest.fn(
      (_req, res) => res.status(204).end(),
    ),
    listTransactions: jest.fn(
      (_req, res) => res.status(204).end(),
    ),
    getTransaction: jest.fn(
      (_req, res) => res.status(204).end(),
    ),
  }),
);

const personalTransactionController =
  require('../../src/controllers/personalTransactionController');

const personalTransactionRouter =
  require('../../src/routes/personalTransaction.routes');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use(
    '/personal-transactions',
    personalTransactionRouter,
  );

  return app;
}

const validBase = {
  provider: 'mtn',
  transaction_type: 'check_momo_balance',
  client_operation_id:
    '9a38a665-7b23-4bc4-9338-b8f50bca7d03',
};

describe('Personal transaction initiation validation', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function expectRejected(payload, field) {
    const response = await request(app)
      .post('/personal-transactions')
      .send({
        ...validBase,
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
      personalTransactionController.initiateTransaction,
    ).not.toHaveBeenCalled();

    return response;
  }

  async function expectAccepted(payload) {
    const response = await request(app)
      .post('/personal-transactions')
      .send({
        ...validBase,
        ...payload,
      });

    expect(response.status).toBe(204);

    expect(
      personalTransactionController.initiateTransaction,
    ).toHaveBeenCalledTimes(1);

    return response;
  }

  test(
    'balance check accepts no amount or recipient',
    async () => {
      await expectAccepted({
        transaction_type: 'check_momo_balance',
      });
    },
  );

  test(
    'balance check rejects a fake positive amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'check_airtime_balance',
          amount: 5,
        },
        'amount',
      );
    },
  );

  test(
    'balance check accepts explicit zero',
    async () => {
      await expectAccepted({
        transaction_type: 'check_airtime_balance',
        amount: 0,
      });
    },
  );

  test(
    'Send Money requires positive amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'send_money_same_network',
          recipient_phone: '0240000000',
          notes: 'Family',
        },
        'amount',
      );
    },
  );

  test(
    'Send Money requires recipient phone',
    async () => {
      await expectRejected(
        {
          transaction_type: 'send_money_same_network',
          amount: 10,
          notes: 'Family',
        },
        'recipient_phone',
      );
    },
  );

  test(
    'MTN Send Money requires reference',
    async () => {
      await expectRejected(
        {
          transaction_type: 'send_money_same_network',
          amount: 10,
          recipient_phone: '0240000000',
        },
        'notes',
      );
    },
  );

  test(
    'valid MTN same-network Send Money reaches controller',
    async () => {
      await expectAccepted({
        transaction_type: 'send_money_same_network',
        amount: 10,
        recipient_phone: '0240000000',
        notes: 'Family',
      });
    },
  );

  test(
    'MTN cross-network Send Money requires recipient network selection',
    async () => {
      await expectRejected(
        {
          transaction_type: 'send_money_cross_network',
          amount: 10,
          recipient_phone: '0200000000',
          notes: 'Family',
        },
        'selections_in_order',
      );
    },
  );

  test(
    'valid MTN cross-network Send Money reaches controller',
    async () => {
      await expectAccepted({
        transaction_type: 'send_money_cross_network',
        amount: 10,
        recipient_phone: '0200000000',
        notes: 'Family',
        selections_in_order: ['2'],
      });
    },
  );

  test(
    'MTN Airtime requires recipient mode',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_airtime',
          amount: 5,
        },
        'recipient_mode',
      );
    },
  );

  test(
    'MTN Airtime Self needs no recipient phone',
    async () => {
      await expectAccepted({
        transaction_type: 'buy_airtime',
        amount: 5,
        recipient_mode: 'self',
      });
    },
  );

  test(
    'MTN Airtime Other requires recipient phone',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_airtime',
          amount: 5,
          recipient_mode: 'other',
        },
        'recipient_phone',
      );
    },
  );

  test(
    'MTN Airtime Other accepts recipient phone',
    async () => {
      await expectAccepted({
        transaction_type: 'buy_airtime',
        amount: 5,
        recipient_mode: 'other',
        recipient_phone: '0240000000',
      });
    },
  );

  test(
    'Data Bundle requires recipient mode',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_data',
          bundle_category: 'fixed_page1_momo',
        },
        'recipient_mode',
      );
    },
  );

  test(
    'Data Bundle requires bundle category',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_data',
          recipient_mode: 'self',
        },
        'bundle_category',
      );
    },
  );

  test(
    'Data Bundle Other requires recipient phone',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_data',
          recipient_mode: 'other',
          bundle_category: 'fixed_page1_momo',
        },
        'recipient_phone',
      );
    },
  );

  test(
    'fixed Data Bundle accepts omitted amount',
    async () => {
      await expectAccepted({
        transaction_type: 'buy_data',
        recipient_mode: 'self',
        bundle_category: 'fixed_page1_momo',
        selections_in_order: ['3'],
      });
    },
  );

  test(
    'fixed Data Bundle rejects injected amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_data',
          recipient_mode: 'self',
          bundle_category: 'fixed_page1_momo',
          amount: 999,
          selections_in_order: ['3'],
        },
        'amount',
      );
    },
  );

  test(
    'Flexi Data requires positive amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_data',
          recipient_mode: 'self',
          bundle_category: 'flexi_momo',
        },
        'amount',
      );
    },
  );

  test(
    'valid Flexi Data reaches controller',
    async () => {
      await expectAccepted({
        transaction_type: 'buy_data',
        recipient_mode: 'self',
        bundle_category: 'flexi_momo',
        amount: 1,
      });
    },
  );

  test(
    'MashUp requires positive amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_mashup',
          recipient_mode: 'self',
          bundle_category: 'ghc5_page1_momo',
        },
        'amount',
      );
    },
  );

  test(
    'MashUp requires bundle category',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_mashup',
          recipient_mode: 'self',
          amount: 5,
        },
        'bundle_category',
      );
    },
  );

  test(
    'MashUp Other requires recipient phone',
    async () => {
      await expectRejected(
        {
          transaction_type: 'buy_mashup',
          recipient_mode: 'other',
          amount: 5,
          bundle_category: 'ghc5_page1_momo',
        },
        'recipient_phone',
      );
    },
  );

  test(
    'valid MashUp Self reaches controller',
    async () => {
      await expectAccepted({
        transaction_type: 'buy_mashup',
        recipient_mode: 'self',
        amount: 5,
        bundle_category: 'ghc5_page1_momo',
        selections_in_order: ['2'],
      });
    },
  );

  test(
    'Withdraw Cash requires amount',
    async () => {
      await expectRejected(
        {
          transaction_type: 'withdraw_cash',
          merchant_id: '123456',
        },
        'amount',
      );
    },
  );

  test(
    'Withdraw Cash requires till number',
    async () => {
      await expectRejected(
        {
          transaction_type: 'withdraw_cash',
          amount: 10,
        },
        'merchant_id',
      );
    },
  );

  test(
    'valid Withdraw Cash reaches controller',
    async () => {
      await expectAccepted({
        transaction_type: 'withdraw_cash',
        amount: 10,
        merchant_id: '123456',
      });
    },
  );
});
