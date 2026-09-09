'use strict';

const crypto = require('crypto');

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();
const mockDecideOfflineAuthorization = jest.fn();

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
  '../../src/utils/offlineAuthorizationDecision',
  () => ({
    decideOfflineAuthorization:
      (...args) =>
        mockDecideOfflineAuthorization(
          ...args
        ),
  }),
);

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
      normalizeString(body.transaction_type),
    amount:
      normalizeAmount(body.amount),
    recipient_phone:
      normalizeString(body.recipient_phone),
    merchant_id:
      normalizeString(body.merchant_id),
    bank_name:
      normalizeString(body.bank_name),
    account_number:
      normalizeString(body.account_number),
    notes:
      normalizeString(body.notes),
    sim_iccid:
      normalizedIccid,
    sim_slot:
      normalizeInteger(body.sim_slot),
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
    .update(JSON.stringify(canonical))
    .digest('hex');
}

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'personal-user-1',
      session_id: 'session-1',
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

function arrangeNewTransaction({
  disabled,
}) {
  mockQuery
    // Initial replay lookup.
    .mockResolvedValueOnce({
      rows: [],
    })
    // Feature flag lookup.
    .mockResolvedValueOnce({
      rows: [
        {
          value:
            JSON.stringify(
              disabled
            ),
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

  // Reset queued one-shot implementations as well as call history.
  // Disabled-operation tests intentionally return before consuming
  // their later flow/INSERT fixtures, so those queued values must not
  // leak into the next test's idempotency lookup.
  mockQuery.mockReset();
  mockWithTransaction.mockReset();
  mockAuditLog.mockReset();
  mockDecideOfflineAuthorization.mockReset();

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
  'Personal offline authorization integration',
  () => {
    test(
      'idempotent replay returns before offline authorization evaluation',
      async () => {
        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.old.signature',
          });

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

        expect(res.status)
          .toHaveBeenCalledWith(
            200
          );

        expect(
          mockDecideOfflineAuthorization
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'disabled Personal operation without receipt remains blocked',
      async () => {
        arrangeNewTransaction({
          disabled: [
            'mtn:buy_data',
          ],
        });

        mockDecideOfflineAuthorization
          .mockReturnValue({
            allowed: false,
            decision:
              'feature_disabled',
            receipt_claims:
              null,
          });

        const req =
          makeReq();

        const res =
          makeRes();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).toHaveBeenCalledWith({
          currentlyDisabled:
            true,
          receipt:
            undefined,
          user:
            req.user,
          mode:
            'personal',
          provider:
            'mtn',
          transactionType:
            'buy_data',
        });

        expect(res.status)
          .toHaveBeenCalledWith(
            403
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'valid Personal receipt may cross disabled operation boundary',
      async () => {
        arrangeNewTransaction({
          disabled: [
            'mtn:buy_data',
          ],
        });

        mockDecideOfflineAuthorization
          .mockReturnValue({
            allowed: true,
            decision:
              'receipt_allowed',
            receipt_claims: {
              receipt_id:
                'receipt-1',
            },
          });

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.payload.signature',
          });

        const res =
          makeRes();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).toHaveBeenCalledWith({
          currentlyDisabled:
            true,
          receipt:
            'apr1.payload.signature',
          user:
            req.user,
          mode:
            'personal',
          provider:
            'mtn',
          transactionType:
            'buy_data',
        });

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
      'invalid Personal receipt cannot bypass disabled operation',
      async () => {
        arrangeNewTransaction({
          disabled: [
            'mtn:buy_data',
          ],
        });

        const error =
          Object.assign(
            new Error(
              'bad receipt'
            ),
            {
              code:
                'OFFLINE_RECEIPT_SIGNATURE_INVALID',
            }
          );

        mockDecideOfflineAuthorization
          .mockImplementation(
            () => {
              throw error;
            }
          );

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.bad.signature',
          });

        const res =
          makeRes();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            403
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'missing server receipt secret fails unavailable',
      async () => {
        arrangeNewTransaction({
          disabled: [
            'mtn:buy_data',
          ],
        });

        const error =
          Object.assign(
            new Error(
              'secret unavailable'
            ),
            {
              code:
                'OFFLINE_RECEIPT_SECRET_INVALID',
            }
          );

        mockDecideOfflineAuthorization
          .mockImplementation(
            () => {
              throw error;
            }
          );

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.payload.signature',
          });

        const res =
          makeRes();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            503
          );

        expect(res.json)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              code:
                'OFFLINE_AUTHORIZATION_UNAVAILABLE',
            })
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'enabled Personal operation never evaluates optional receipt',
      async () => {
        arrangeNewTransaction({
          disabled: [],
        });

        const req =
          makeReq({
            offline_authorization_receipt:
              'malformed-but-irrelevant',
          });

        const res =
          makeRes();

        await controller
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).not.toHaveBeenCalled();

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);
