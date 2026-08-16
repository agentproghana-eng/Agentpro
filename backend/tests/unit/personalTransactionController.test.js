'use strict';

const mockQuery = jest.fn();
const mockAuditLog = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
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

// initiateTransaction does not use these sanitizers, but the Personal
// controller imports them for its completion endpoint. Keep this suite
// isolated from the much larger Business transaction controller.
jest.mock('../../src/controllers/transactionController', () => ({
  sanitizeUSSDLog: jest.fn((value) => value),
  sanitizeFailureReason: jest.fn((value) => value),
}));

const personalTransactionController =
  require('../../src/controllers/personalTransactionController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeReq({
  plan = 'free',
  expiresAt = null,
  provider = 'future_provider',
  transactionType = 'future_type',
} = {}) {
  return {
    user: { id: 'personal-user-1' },
    personalSubscription: {
      plan,
      expires_at: expiresAt,
    },
    body: {
      provider,
      transaction_type: transactionType,
      amount: '25.00',
      recipient_phone: '0240000000',
      merchant_id: 'TILL-1',
      sim_iccid: 'SIM-ICCID-1',
      sim_slot: 0,
      notes: 'REF-1',
      bundle_category: null,
      recipient_mode: null,
    },
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest',
    },
    requestId: 'request-1',
  };
}

function insertedTransaction() {
  return {
    id: 'personal-tx-1',
    reference: 'PER-TEST',
    status: 'initiated',
    created_at: '2026-08-13T12:00:00.000Z',
  };
}

describe('personalTransactionController initiation entitlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
  });

  test('Free Personal uses only the Global flow and enables automation', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*170#' }],
      })
      .mockResolvedValueOnce({
        rows: [insertedTransaction()],
      });

    const req = makeReq();
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [globalSql, globalParams] = mockQuery.mock.calls[0];
    expect(globalSql).toContain('company_id IS NULL');
    expect(globalSql).toContain('owner_user_id IS NULL');
    expect(globalSql).not.toContain('owner_user_id = $1');
    expect(globalParams).toEqual([
      'future_provider',
      'future_type',
      null,
      null,
    ]);

    const [insertSql] = mockQuery.mock.calls[1];
    expect(insertSql).toContain('INSERT INTO personal_transactions');

    expect(mockAuditLog).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'personal-tx-1',
        automation_entitled: true,
        personal_override_entitled: false,
        manual_dial_code: null,
      }),
    });
  });

  test('Paid Personal uses its Personal override without querying Global', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*personal#' }],
      })
      .mockResolvedValueOnce({
        rows: [insertedTransaction()],
      });

    const req = makeReq({
      plan: 'paid',
      expiresAt: '2099-12-31T23:59:59.999Z',
      provider: 'mtn',
      transactionType: 'buy_airtime',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [personalSql, personalParams] = mockQuery.mock.calls[0];
    expect(personalSql).toContain('owner_user_id = $1');
    expect(personalSql).toContain('company_id IS NULL');
    expect(personalParams).toEqual([
      'personal-user-1',
      'mtn',
      'buy_airtime',
      null,
      null,
    ]);

    const [insertSql] = mockQuery.mock.calls[1];
    expect(insertSql).toContain('INSERT INTO personal_transactions');

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        automation_entitled: true,
        personal_override_entitled: true,
        manual_dial_code: null,
      }),
    });
  });

  test('Paid Personal falls back to Global when no Personal override exists', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*global#' }],
      })
      .mockResolvedValueOnce({
        rows: [insertedTransaction()],
      });

    const req = makeReq({
      plan: 'paid',
      expiresAt: '2099-12-31T23:59:59.999Z',
      provider: 'future_provider',
      transactionType: 'future_type',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [personalSql] = mockQuery.mock.calls[0];
    expect(personalSql).toContain('owner_user_id = $1');

    const [globalSql, globalParams] = mockQuery.mock.calls[1];
    expect(globalSql).toContain('company_id IS NULL');
    expect(globalSql).toContain('owner_user_id IS NULL');
    expect(globalParams).toEqual([
      'future_provider',
      'future_type',
      null,
      null,
    ]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        automation_entitled: true,
        personal_override_entitled: true,
        manual_dial_code: null,
      }),
    });
  });

  test('MTN Personal Send Money passes its reference to USSD automation', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*170#' }],
      })
      .mockResolvedValueOnce({
        rows: [insertedTransaction()],
      });

    const req = makeReq({
      plan: 'paid',
      expiresAt: '2099-12-31T23:59:59.999Z',
      provider: 'mtn',
      transactionType: 'send_money_same_network',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const payload = res.json.mock.calls[0][0];

    expect(payload.data.automation_entitled).toBe(true);
    expect(payload.data.personal_override_entitled).toBe(true);
    expect(payload.data.manual_dial_code).toBeNull();

    expect(payload.data.automation_params).toEqual(
      expect.objectContaining({
        amount: '25.00',
        customer_phone: '0240000000',
        recipient_phone: '0240000000',
        payment_reference: 'REF-1',
      })
    );
  });

  test('expired Paid Personal is treated as Free and cannot query a Personal override', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*110#' }],
      })
      .mockResolvedValueOnce({
        rows: [insertedTransaction()],
      });

    const req = makeReq({
      plan: 'paid',
      expiresAt: '2000-01-01T00:00:00.000Z',
      provider: 'telecel',
      transactionType: 'buy_data',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [globalSql] = mockQuery.mock.calls[0];
    expect(globalSql).toContain('owner_user_id IS NULL');
    expect(globalSql).not.toContain('owner_user_id = $1');

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        automation_entitled: true,
        personal_override_entitled: false,
        manual_dial_code: null,
      }),
    });
  });

  test('rejects Free Personal initiation when no matching Global flow exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({
      provider: 'mtn',
      transactionType: 'buy_mashup',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No USSD flow configured for mtn buy_mashup',
    });
  });


});

describe('personalTransactionController physical SIM activity scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
  });

  test('recent Personal activity can be scoped to one physical SIM', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'personal-user-1' },
      query: {
        provider: 'mtn',
        sim_iccid: 'ICCID-SIM-2',
        sim_slot: '1',
      },
    };
    const res = makeRes();

    await personalTransactionController.listRecentTransactions(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('provider = $2');
    expect(sql).toContain('sim_iccid = $3');
    expect(sql).toContain('sim_slot = $4');

    expect(params).toEqual([
      'personal-user-1',
      'mtn',
      'ICCID-SIM-2',
      1,
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
      meta: {
        limit: 5,
      },
    });
  });
});
