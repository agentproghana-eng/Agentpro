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

  test('Free Personal uses only the Global flow and returns its manual dial code', async () => {
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
        automation_entitled: false,
        manual_dial_code: '*170#',
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
        manual_dial_code: null,
      }),
    });
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
        automation_entitled: false,
        manual_dial_code: '*110#',
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

  test('rejects Free Personal initiation when the Global flow has no manual dial code', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dial_code: null }],
    });

    const req = makeReq({
      provider: 'future_provider',
      transactionType: 'future_type',
    });
    const res = makeRes();

    await personalTransactionController.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'No manual USSD dial code configured for future_provider future_type',
    });
  });
});
