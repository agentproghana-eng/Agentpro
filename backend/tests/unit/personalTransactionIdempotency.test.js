'use strict';

const crypto = require('crypto');

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

jest.mock('../../src/controllers/transactionController', () => ({
  sanitizeUSSDLog: jest.fn((value) => value),
  sanitizeFailureReason: jest.fn((value) => value),
}));

const controller =
  require('../../src/controllers/personalTransactionController');

const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

const normalizeString = (value) =>
  value === null || value === undefined ? '' : String(value).trim();

const normalizeInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : normalizeString(value);
};

const normalizeAmount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toFixed(2)
    : normalizeString(value);
};

function fingerprint(body) {
  const normalizedIccid = normalizeString(body.sim_iccid);

  const canonical = {
    provider: normalizeString(body.provider),
    transaction_type: normalizeString(body.transaction_type),
    amount: normalizeAmount(body.amount),
    recipient_phone: normalizeString(body.recipient_phone),
    merchant_id: normalizeString(body.merchant_id),
    notes: normalizeString(body.notes),
    sim_iccid: normalizedIccid,
    sim_slot: normalizeInteger(body.sim_slot),
    installation_id: normalizedIccid
      ? ''
      : normalizeString(body.installation_id),
    sim_subscription_id: normalizedIccid
      ? null
      : normalizeInteger(body.sim_subscription_id),
    bundle_category: normalizeString(body.bundle_category),
    recipient_mode: normalizeString(body.recipient_mode),
    selections_in_order: Array.isArray(body.selections_in_order)
      ? body.selections_in_order.map(normalizeString)
      : [],
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

function makeReq(overrides = {}) {
  return {
    user: { id: 'personal-user-1' },
    personalSubscription: {
      plan: 'free',
      expires_at: null,
    },
    body: {
      provider: 'mtn',
      transaction_type: 'buy_data',
      amount: 10,
      recipient_phone: '0240000000',
      merchant_id: '',
      notes: '',
      sim_iccid: 'ICCID-1',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 9,
      bundle_category: 'fixed_page1_momo',
      recipient_mode: 'other',
      selections_in_order: ['5'],
      client_operation_id: operationId,
      ...overrides,
    },
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest',
    },
    requestId: 'request-1',
  };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function existingFor(req, overrides = {}) {
  return {
    id: 'personal-tx-1',
    reference: 'PER-TEST-1',
    status: 'initiated',
    created_at: '2026-08-18T00:00:00.000Z',
    client_operation_fingerprint: fingerprint(req.body),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuditLog.mockResolvedValue(undefined);
});

describe('Personal transaction initiation idempotency', () => {
  test('returns the existing Personal transaction for the same operation', async () => {
    const req = makeReq();
    const res = makeRes();

    mockQuery.mockResolvedValueOnce({
      rows: [existingFor(req)],
    });

    await controller.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'personal-tx-1',
          idempotent_replay: true,
        }),
      }),
    );
  });

  test('rejects reuse of a UUID with different Personal transaction data', async () => {
    const req = makeReq();
    const res = makeRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        existingFor(req, {
          client_operation_fingerprint: '0'.repeat(64),
        }),
      ],
    });

    await controller.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'CLIENT_OPERATION_CONFLICT',
      }),
    );
  });

  test('identified SIM replay ignores fallback metadata changes', async () => {
    const originalReq = makeReq();

    const retryReq = makeReq({
      installation_id:
        '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 99,
    });

    const res = makeRes();

    mockQuery.mockResolvedValueOnce({
      rows: [existingFor(originalReq)],
    });

    await controller.initiateTransaction(retryReq, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'personal-tx-1',
          idempotent_replay: true,
        }),
      }),
    );
  });

  test('unresolved SIM replay conflicts when fallback identity changes', async () => {
    const originalReq = makeReq({
      sim_iccid: null,
    });

    const retryReq = makeReq({
      sim_iccid: null,
      installation_id:
        '22222222-2222-4222-8222-222222222222',
    });

    const res = makeRes();

    mockQuery.mockResolvedValueOnce({
      rows: [existingFor(originalReq)],
    });

    await controller.initiateTransaction(retryReq, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'CLIENT_OPERATION_CONFLICT',
      }),
    );
  });

  test('stores the UUID and fingerprint on a new Personal transaction', async () => {
    const req = makeReq();
    const res = makeRes();

    mockQuery
      // Initial idempotency lookup.
      .mockResolvedValueOnce({ rows: [] })
      // Global flow lookup.
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*170#' }],
      })
      // INSERT.
      .mockResolvedValueOnce({
        rows: [{
          id: 'personal-tx-new',
          reference: 'PER-NEW',
          status: 'initiated',
          created_at: '2026-08-18T00:00:00.000Z',
        }],
      });

    await controller.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [insertSql, insertParams] = mockQuery.mock.calls[2];

    expect(insertSql).toContain('client_operation_id');
    expect(insertSql).toContain('client_operation_fingerprint');
    expect(insertParams).toContain(operationId);
    expect(insertParams).toContain(fingerprint(req.body));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  test('concurrent duplicate INSERT resolves to the original transaction', async () => {
    const req = makeReq();
    const res = makeRes();

    const conflict = Object.assign(
      new Error('duplicate key'),
      {
        code: '23505',
        constraint:
          'idx_personal_transactions_user_client_operation',
      },
    );

    mockQuery
      // Initial replay lookup sees nothing.
      .mockResolvedValueOnce({ rows: [] })
      // Global flow lookup.
      .mockResolvedValueOnce({
        rows: [{ dial_code: '*170#' }],
      })
      // This request loses the race at INSERT.
      .mockRejectedValueOnce(conflict)
      // Read the winner.
      .mockResolvedValueOnce({
        rows: [existingFor(req)],
      });

    await controller.initiateTransaction(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'personal-tx-1',
          idempotent_replay: true,
        }),
      }),
    );
  });
});
