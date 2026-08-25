const express = require('express');
const request = require('supertest');

const mockBusinessController = {
  getSubscription: jest.fn((_req, res) => res.status(204).end()),
  submitPayment: jest.fn((_req, res) => res.status(204).end()),
  listPendingPayments: jest.fn((_req, res) => res.status(204).end()),
  listReconciliationPayments: jest.fn((_req, res) => res.status(204).end()),
  verifyPayment: jest.fn((_req, res) => res.status(204).end()),
};

const mockPersonalController = {
  getSubscription: jest.fn((_req, res) => res.status(204).end()),
  submitPayment: jest.fn((_req, res) => res.status(204).end()),
  listPendingPayments: jest.fn((_req, res) => res.status(204).end()),
  listReconciliationPayments: jest.fn((_req, res) => res.status(204).end()),
  verifyPayment: jest.fn((_req, res) => res.status(204).end()),
};

jest.mock(
  '../../src/controllers/subscriptionController',
  () => mockBusinessController,
);

jest.mock(
  '../../src/controllers/personalSubscriptionController',
  () => mockPersonalController,
);

let mockRole = 'business_owner';

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'user-1',
      role: mockRole,
      company_id: 'company-1',
    };
    next();
  },

  authorize: (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }
    next();
  },

  requirePersonalAccount: (req, _res, next) => {
    req.personalSubscription = {
      plan: 'free',
      expires_at: null,
    };
    next();
  },
}));

const businessRoutes =
  require('../../src/routes/subscription.routes');

const personalRoutes =
  require('../../src/routes/personalSubscription.routes');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use('/subscriptions', businessRoutes);
  app.use('/personal-subscription', personalRoutes);

  return app;
}

describe('Subscription route validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'business_owner';
  });

  test('Business payment rejects a blank MoMo reference', async () => {
    const response = await request(makeApp())
      .post('/subscriptions/payment')
      .send({
        momo_reference: '   ',
        payment_phone: '0240000000',
      });

    expect(response.status).toBe(422);
    expect(mockBusinessController.submitPayment)
      .not.toHaveBeenCalled();
  });

  test('Personal payment rejects a blank payment phone', async () => {
    const response = await request(makeApp())
      .post('/personal-subscription/payment')
      .send({
        momo_reference: 'MOMO-REF-1',
        payment_phone: '   ',
      });

    expect(response.status).toBe(422);
    expect(mockPersonalController.submitPayment)
      .not.toHaveBeenCalled();
  });

  test('Business verification rejects an unknown action', async () => {
    mockRole = 'superuser';

    const response = await request(makeApp())
      .patch(
        '/subscriptions/payment/' +
          '11111111-1111-4111-8111-111111111111/verify',
      )
      .send({
        action: 'explode',
      });

    expect(response.status).toBe(422);
    expect(mockBusinessController.verifyPayment)
      .not.toHaveBeenCalled();
  });

  test('Personal verification rejects an unknown action', async () => {
    mockRole = 'superuser';

    const response = await request(makeApp())
      .patch(
        '/personal-subscription/payment/' +
          '11111111-1111-4111-8111-111111111111/verify',
      )
      .send({
        action: 'explode',
      });

    expect(response.status).toBe(422);
    expect(mockPersonalController.verifyPayment)
      .not.toHaveBeenCalled();
  });
});
