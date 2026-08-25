const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockTransactionQuery = jest.fn();
const mockAuditLog = jest.fn();
const mockSendWelcomeEmail = jest.fn();
const mockSendToUser = jest.fn();
const mockSendToCompany = jest.fn();
const mockSendSubscriptionSuspended = jest.fn();
const mockSendToMultiple = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: (...args) => mockSendWelcomeEmail(...args),
  sendSubscriptionReminderEmail: jest.fn(),
}));

jest.mock('../../src/services/smsService', () => ({
  sendSubscriptionRenewalSMS: jest.fn(),
}));

jest.mock('../../src/services/notificationService', () => ({
  sendToUser: (...args) => mockSendToUser(...args),
  sendToCompany: (...args) => mockSendToCompany(...args),
  sendSubscriptionSuspended: (...args) =>
    mockSendSubscriptionSuspended(...args),
  sendToMultiple: (...args) => mockSendToMultiple(...args),
}));

const subscriptionController =
  require('../../src/controllers/subscriptionController');

const personalSubscriptionController =
  require('../../src/controllers/personalSubscriptionController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeBusinessReq(body = {}) {
  return {
    user: {
      id: 'owner-1',
      role: 'business_owner',
      company_id: 'company-1',
    },
    body,
    params: {},
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest',
    },
    requestId: 'request-1',
  };
}

function makePersonalReq(body = {}) {
  return {
    user: {
      id: 'personal-user-1',
      role: 'customer',
      company_id: null,
    },
    body,
    params: {},
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest',
    },
    requestId: 'request-1',
  };
}

describe('Subscription controller contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockAuditLog.mockResolvedValue(undefined);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
    mockSendToUser.mockResolvedValue(undefined);
    mockSendToCompany.mockResolvedValue(undefined);
    mockSendSubscriptionSuspended.mockResolvedValue(undefined);
    mockSendToMultiple.mockResolvedValue([]);

    mockTransactionQuery.mockReset();
    mockTransactionQuery.mockResolvedValue({ rows: [] });

    mockWithTransaction.mockImplementation(async (callback) =>
      callback({
        query: (...args) => mockTransactionQuery(...args),
      }),
    );
  });

  test('Business payment amount is always calculated by the server', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: '6' }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'subscription-1',
          company_id: 'company-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockTransactionQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'subscription-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'payment-1',
          amount: '50.00',
        }],
      });

    const req = makeBusinessReq({
      momo_reference: 'BUSINESS-REF-1',
      payment_phone: '0240000000',
      amount: 0.01,
      notes: 'renewal',
    });

    const res = makeRes();

    await subscriptionController.submitPayment(req, res);

    const insertCall = mockTransactionQuery.mock.calls.find(
      ([sql]) => String(sql).includes(
        'INSERT INTO subscription_payments',
      ),
    );

    expect(insertCall).toBeDefined();

    // Six active seats => one free seat and five paid seats.
    // At GH₵10 per paid seat, the authoritative charge is GH₵50.
    expect(insertCall[1][2]).toBe(50);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('Personal payment refuses a second pending submission', async () => {
    mockTransactionQuery
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'personal-user-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'pending-payment-1',
        }],
      });

    const req = makePersonalReq({
      momo_reference: 'PERSONAL-REF-2',
      payment_phone: '0240000000',
    });

    const res = makeRes();

    await personalSubscriptionController.submitPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockTransactionQuery).toHaveBeenCalledTimes(2);

    const [lockSql, lockParams] =
      mockTransactionQuery.mock.calls[0];
    const [pendingSql, pendingParams] =
      mockTransactionQuery.mock.calls[1];

    expect(lockSql).toContain(
      'personal_subscriptions',
    );
    expect(lockSql).toContain('FOR UPDATE');
    expect(lockParams).toEqual([
      'personal-user-1',
    ]);

    expect(pendingSql).toContain(
      'personal_subscription_payments',
    );
    expect(pendingSql).toContain(
      "status IN ('pending', 'submitted')",
    );
    expect(pendingParams).toEqual([
      'personal-user-1',
    ]);
  });

  test('Business controller rejects an unknown verification action', async () => {
    const req = makeBusinessReq({
      action: 'explode',
    });

    req.params.payment_id =
      '11111111-1111-4111-8111-111111111111';

    const res = makeRes();

    await subscriptionController.verifyPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  test('Personal controller rejects an unknown verification action', async () => {
    const req = makePersonalReq({
      action: 'explode',
    });

    req.params.payment_id =
      '11111111-1111-4111-8111-111111111111';

    const res = makeRes();

    await personalSubscriptionController.verifyPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });
  test(
    'Business approval succeeds even when the post-commit welcome email fails',
    async () => {
      mockTransactionQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'business-payment-approve',
            subscription_id: 'subscription-1',
            company_id: 'company-1',
            status: 'pending',
            period_months: 1,
            amount: '50.00',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'subscription-1',
            status: 'inactive',
            expires_at: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'owner-1',
            email: 'owner@example.com',
            first_name: 'Owner',
            phone: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            name: 'Example Company',
          }],
        });

      mockSendWelcomeEmail.mockRejectedValueOnce(
        new Error('SMTP unavailable'),
      );

      const req = makeBusinessReq({
        action: 'approve',
      });

      req.params.payment_id =
        '11111111-1111-4111-8111-111111111111';

      const res = makeRes();

      await subscriptionController.verifyPayment(
        req,
        res,
      );

      expect(mockWithTransaction).toHaveBeenCalledTimes(1);

      expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'Owner',
        'Example Company',
      );

      expect(mockSendToUser).toHaveBeenCalledWith(
        'owner-1',
        expect.objectContaining({
          type: 'renewal_approved',
        }),
      );

      expect(res.status).not.toHaveBeenCalledWith(500);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    },
  );

  test(
    'Personal approval notifies the subscriber with a Personal subscription type',
    async () => {
      const clientQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'personal-payment-approve',
            user_id: 'personal-user-1',
            status: 'pending',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            plan: 'free',
            expires_at: null,
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockWithTransaction.mockImplementationOnce(
        async (callback) => callback({
          query: clientQuery,
        }),
      );

      const req = makePersonalReq({
        action: 'approve',
      });

      req.params.payment_id =
        '11111111-1111-4111-8111-111111111111';

      const res = makeRes();

      await personalSubscriptionController.verifyPayment(
        req,
        res,
      );

      expect(mockSendToUser).toHaveBeenCalledWith(
        'personal-user-1',
        expect.objectContaining({
          type: 'personal_subscription_approved',
        }),
      );
    },
  );

  test(
    'Personal rejection notifies the subscriber with a Personal subscription type',
    async () => {
      const clientQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'personal-payment-reject',
            user_id: 'personal-user-1',
            status: 'pending',
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockWithTransaction.mockImplementationOnce(
        async (callback) => callback({
          query: clientQuery,
        }),
      );

      const req = makePersonalReq({
        action: 'reject',
        rejection_reason: 'Reference not found',
      });

      req.params.payment_id =
        '11111111-1111-4111-8111-111111111111';

      const res = makeRes();

      await personalSubscriptionController.verifyPayment(
        req,
        res,
      );

      expect(mockSendToUser).toHaveBeenCalledWith(
        'personal-user-1',
        expect.objectContaining({
          type: 'personal_subscription_rejected',
        }),
      );
    },
  );

  test(
    'expired Personal subscription can submit a renewal payment',
    async () => {
      mockTransactionQuery
        .mockReset();

      mockTransactionQuery
        .mockResolvedValueOnce({
          rows: [
            {
              user_id:
                'personal-user-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id:
                'expired-renewal-payment',
              user_id:
                'personal-user-1',
              amount:
                '5.00',
              status:
                'pending',
            },
          ],
        });

      const req =
        makePersonalReq({
          momo_reference:
            'EXPIRED-RENEWAL-REF',
          payment_phone:
            '0240000000',
        });

      const res =
        makeRes();

      await personalSubscriptionController
        .submitPayment(
          req,
          res,
        );

      const insertCall =
        mockTransactionQuery
          .mock
          .calls
          .find(
            ([sql]) =>
              String(sql).includes(
                'INSERT INTO personal_subscription_payments'
              ),
          );

      expect(
        insertCall,
      ).toBeDefined();

      expect(
        insertCall[1],
      ).toEqual([
        'personal-user-1',
        'EXPIRED-RENEWAL-REF',
        '0240000000',
        null,
      ]);

      expect(
        res.status,
      ).toHaveBeenCalledWith(
        201,
      );

      expect(
        res.json,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          success:
            true,
        }),
      );
    },
  );

  test(
    'approval after Personal expiry starts a fresh paid month from approval time',
    async () => {
      const fixedNow =
        new Date(
          '2026-08-25T10:30:00.000Z',
        );

      const expiredAt =
        new Date(
          '2026-08-01T00:00:00.000Z',
        );

      const expectedExpiry =
        new Date(
          fixedNow,
        );

      expectedExpiry.setMonth(
        expectedExpiry.getMonth() +
          1,
      );

      mockTransactionQuery
        .mockReset();

      mockTransactionQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id:
                'expired-renewal-payment',
              user_id:
                'personal-user-1',
              status:
                'pending',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              plan:
                'paid',
              expires_at:
                expiredAt,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      const req =
        makePersonalReq({
          action:
            'approve',
        });

      req.params.payment_id =
        '11111111-1111-4111-8111-111111111111';

      const res =
        makeRes();

      jest.useFakeTimers();

      jest.setSystemTime(
        fixedNow,
      );

      try {
        await personalSubscriptionController
          .verifyPayment(
            req,
            res,
          );
      } finally {
        jest.useRealTimers();
      }

      const subscriptionUpdate =
        mockTransactionQuery
          .mock
          .calls
          .find(
            ([sql]) =>
              String(sql).includes(
                "UPDATE personal_subscriptions"
              ),
          );

      expect(
        subscriptionUpdate,
      ).toBeDefined();

      expect(
        subscriptionUpdate[1][0],
      ).toBeInstanceOf(
        Date,
      );

      expect(
        subscriptionUpdate[1][0]
          .getTime(),
      ).toBe(
        expectedExpiry.getTime(),
      );

      expect(
        subscriptionUpdate[1][0]
          .getTime(),
      ).toBeGreaterThan(
        fixedNow.getTime(),
      );

      expect(
        res.json,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          success:
            true,
        }),
      );
    },
  );


});
