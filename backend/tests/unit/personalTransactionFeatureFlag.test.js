'use strict';

const crypto = require('crypto');

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) =>
    mockWithTransaction(...args),
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

jest.mock(
  '../../src/controllers/transactionController',
  () => ({
    sanitizeUSSDLog: jest.fn((value) => value),
    sanitizeFailureReason: jest.fn((value) => value),
  }),
);

const controller =
  require(
    '../../src/controllers/personalTransactionController'
  );

const operationId =
  '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

function normalizeString(value) {
  return value === null ||
    value === undefined
    ? ''
    : String(value).trim();
}

function normalizeInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed)
    ? parsed
    : normalizeString(value);
}

function normalizeAmount(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed.toFixed(2)
    : normalizeString(value);
}

function fingerprint(body) {
  const normalizedIccid =
    normalizeString(body.sim_iccid);

  const canonical = {
    provider:
      normalizeString(body.provider),
    transaction_type:
      normalizeString(
        body.transaction_type
      ),
    amount:
      normalizeAmount(body.amount),
    recipient_phone:
      normalizeString(
        body.recipient_phone
      ),
    merchant_id:
      normalizeString(
        body.merchant_id
      ),
    bank_name:
      normalizeString(
        body.bank_name
      ),
    account_number:
      normalizeString(
        body.account_number
      ),
    notes:
      normalizeString(body.notes),
    sim_iccid:
      normalizedIccid,
    sim_slot:
      normalizeInteger(
        body.sim_slot
      ),
    installation_id:
      normalizedIccid
        ? ''
        : normalizeString(
            body.installation_id
          ),
    sim_subscription_id:
      normalizedIccid
        ? null
        : normalizeInteger(
            body.sim_subscription_id
          ),
    bundle_category:
      normalizeString(
        body.bundle_category
      ),
    recipient_mode:
      normalizeString(
        body.recipient_mode
      ),
    selections_in_order:
      Array.isArray(
        body.selections_in_order
      )
        ? body.selections_in_order.map(
            normalizeString
          )
        : [],
  };

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(canonical)
    )
    .digest('hex');
}

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'personal-user-1',
    },
    personalSubscription: {
      plan: 'free',
      expires_at: null,
    },
    body: {
      provider: 'mtn',
      transaction_type:
        'buy_data',
      amount: 10,
      recipient_phone:
        '0240000000',
      merchant_id: '',
      bank_name: '',
      account_number: '',
      notes: '',
      sim_iccid: 'ICCID-1',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 9,
      bundle_category:
        'fixed_page1_momo',
      recipient_mode: 'other',
      selections_in_order: [
        '5',
      ],
      client_operation_id:
        operationId,
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
    status:
      jest.fn().mockReturnThis(),
    json:
      jest.fn().mockReturnThis(),
  };
}

function existingFor(req) {
  return {
    id: 'personal-tx-1',
    reference:
      'PER-TEST-1',
    status: 'initiated',
    created_at:
      '2026-09-01T00:00:00.000Z',
    client_operation_fingerprint:
      fingerprint(req.body),
  };
}

function arrangeEnabledNewTransaction() {
  mockQuery
    // Initial idempotent replay lookup.
    .mockResolvedValueOnce({
      rows: [],
    })
    // Feature flag lookup.
    .mockResolvedValueOnce({
      rows: [
        {
          value:
            JSON.stringify([]),
        },
      ],
    })
    // Global flow lookup.
    .mockResolvedValueOnce({
      rows: [
        {
          dial_code: '*170#',
        },
      ],
    })
    // INSERT.
    .mockResolvedValueOnce({
      rows: [
        {
          id:
            'personal-tx-new',
          reference:
            'PER-NEW',
          status:
            'initiated',
          created_at:
            '2026-09-01T00:00:00.000Z',
        },
      ],
    });
}

beforeEach(() => {
  jest.clearAllMocks();

  mockWithTransaction
    .mockImplementation(
      async (callback) =>
        callback({
          query:
            (...args) =>
              mockQuery(
                ...args
              ),
        })
    );

  mockAuditLog
    .mockResolvedValue(
      undefined
    );
});

describe(
  'Personal transaction feature flag enforcement',
  () => {
    test(
      'idempotent replay returns before feature flag lookup',
      async () => {
        const req =
          makeReq();

        const res =
          makeRes();

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              existingFor(req),
            ],
          });

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            1
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            200
          );

        expect(res.json)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              data:
                expect.objectContaining({
                  idempotent_replay:
                    true,
                }),
            })
          );
      }
    );

    test(
      'disabled Personal operation is blocked before flow lookup or insert',
      async () => {
        const req =
          makeReq();

        const res =
          makeRes();

        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                value:
                  JSON.stringify([
                    'mtn:buy_data',
                  ]),
              },
            ],
          });

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            2
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            403
          );

        expect(res.json)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              code:
                'TRANSACTION_TYPE_DISABLED',
            })
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();

        expect(
          mockAuditLog
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'enabled Personal operation continues through existing initiation path',
      async () => {
        const req =
          makeReq();

        const res =
          makeRes();

        arrangeEnabledNewTransaction();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            4
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );

        expect(res.status)
          .toHaveBeenCalledWith(
            201
          );
      }
    );

    test(
      'feature flag database failure preserves existing live Personal behavior',
      async () => {
        const req =
          makeReq();

        const res =
          makeRes();

        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockRejectedValueOnce(
            new Error(
              'config unavailable'
            )
          )
          .mockResolvedValueOnce({
            rows: [
              {
                dial_code:
                  '*170#',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'personal-tx-new',
                reference:
                  'PER-NEW',
                status:
                  'initiated',
                created_at:
                  '2026-09-01T00:00:00.000Z',
              },
            ],
          });

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            201
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      'malformed feature flag config preserves existing live Personal behavior',
      async () => {
        const req =
          makeReq();

        const res =
          makeRes();

        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                value:
                  '{"broken"',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                dial_code:
                  '*170#',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'personal-tx-new',
                reference:
                  'PER-NEW',
                status:
                  'initiated',
                created_at:
                  '2026-09-01T00:00:00.000Z',
              },
            ],
          });

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            201
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);
