'use strict';

const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn();

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
  auditLog: jest.fn(),
}));

jest.mock(
  '../../src/controllers/transactionController',
  () => ({
    sanitizeUSSDLog: jest.fn((value) => value),
    sanitizeFailureReason: jest.fn((value) => value),
  })
);

const controller =
  require(
    '../../src/controllers/personalTransactionController'
  );

const controllerPath = path.join(
  __dirname,
  '../../src/controllers/personalTransactionController.js'
);

const routePath = path.join(
  __dirname,
  '../../src/routes/personalTransaction.routes.js'
);

const migrationPath = path.join(
  __dirname,
  '../../migrations/135_personal_transaction_cursor_indexes.sql'
);

const controllerSource =
  fs.readFileSync(controllerPath, 'utf8');

const routes =
  fs.readFileSync(routePath, 'utf8');

const migration =
  fs.readFileSync(migrationPath, 'utf8');

const USER_ID =
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const ID_1 =
  '11111111-1111-1111-1111-111111111111';

const ID_2 =
  '22222222-2222-2222-2222-222222222222';

const ID_3 =
  '33333333-3333-3333-3333-333333333333';

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeReq(query = {}) {
  return {
    user: { id: USER_ID },
    query,
  };
}

function decodeCursor(cursor) {
  return JSON.parse(
    Buffer.from(
      cursor,
      'base64url'
    ).toString('utf8')
  );
}

function encodeCursor(payload) {
  return Buffer.from(
    JSON.stringify(payload),
    'utf8'
  ).toString('base64url');
}

describe(
  'personal transaction cursor pagination contract',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'registers additive Paid-only cursor route before transaction id route',
      () => {
        const normalized =
          routes.replace(/\s+/g, ' ');

        expect(normalized).toContain(
          "router.get( '/history', requirePaidPersonalPlan, personalTransactionController.listTransactions );"
        );

        expect(normalized).toContain(
          "router.get( '/history/cursor', requirePaidPersonalPlan, personalTransactionController.listTransactionsCursor );"
        );

        expect(
          normalized.indexOf(
            "'/history/cursor'"
          )
        ).toBeLessThan(
          normalized.indexOf(
            "'/:transaction_id'"
          )
        );
      }
    );

    test(
      'cursor handler is bounded and does not use OFFSET or COUNT',
      () => {
        const start =
          controllerSource.indexOf(
            'exports.listTransactionsCursor'
          );

        const end =
          controllerSource.indexOf(
            'exports.listTransactions = async',
            start
          );

        const source =
          controllerSource.slice(
            start,
            end
          );

        expect(source).toContain(
          'parsedLimit + 1'
        );

        expect(source).not.toContain(
          'OFFSET'
        );

        expect(source).not.toContain(
          'COUNT(*)'
        );
      }
    );

    test(
      'migration 135 covers every supported Personal history ordering',
      () => {
        expect(migration).toContain(
          'idx_personal_transactions_user_created_desc_cursor'
        );

        expect(migration).toContain(
          'created_at DESC'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_created_asc_cursor'
        );

        expect(migration).toContain(
          'created_at ASC'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_amount_desc_cursor'
        );

        expect(migration).toContain(
          'amount DESC NULLS FIRST'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_amount_asc_cursor'
        );

        expect(migration).toContain(
          'amount ASC NULLS LAST'
        );
      }
    );

    test(
      'date desc first page is bounded and emits versioned ISO cursor',
      async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: ID_3,
              created_at:
                new Date(
                  '2026-09-15T12:03:00.000Z'
                ),
              amount: '30.00',
            },
            {
              id: ID_2,
              created_at:
                new Date(
                  '2026-09-15T12:02:00.000Z'
                ),
              amount: '20.00',
            },
            {
              id: ID_1,
              created_at:
                new Date(
                  '2026-09-15T12:01:00.000Z'
                ),
              amount: '10.00',
            },
          ],
        });

        const req = makeReq({
          limit: '2',
          sort_by: 'date',
          sort_order: 'desc',
        });

        const res = makeRes();

        await controller
          .listTransactionsCursor(
            req,
            res
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(1);

        const [sql, params] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'ORDER BY created_at DESC, id DESC'
        );

        expect(sql).not.toContain(
          'OFFSET'
        );

        expect(sql).not.toContain(
          'COUNT(*)'
        );

        expect(params.at(-1)).toBe(3);

        const body =
          res.json.mock.calls[0][0];

        expect(body.meta).toMatchObject({
          limit: 2,
          has_more: true,
        });

        expect(body.data).toHaveLength(2);

        const decoded =
          decodeCursor(
            body.meta.next_cursor
          );

        expect(decoded).toEqual({
          v: 1,
          sort_by: 'date',
          sort_order: 'desc',
          value:
            '2026-09-15T12:02:00.000Z',
          id: ID_2,
        });
      }
    );

    test(
      'date desc seek uses created_at and id cursor',
      async () => {
        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'date',
            sort_order: 'desc',
            value:
              '2026-09-15T12:02:00.000Z',
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        const res = makeRes();

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              limit: '2',
              sort_by: 'date',
              sort_order: 'desc',
            }),
            res
          );

        const [sql, params] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'created_at <'
        );

        expect(sql).toContain(
          'created_at ='
        );

        expect(sql).toContain(
          'id <'
        );

        expect(params).toContain(
          '2026-09-15T12:02:00.000Z'
        );

        expect(params).toContain(ID_2);
      }
    );

    test(
      'date asc seek uses ascending date and descending id tie break',
      async () => {
        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'date',
            sort_order: 'asc',
            value:
              '2026-09-15T12:02:00.000Z',
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'date',
              sort_order: 'asc',
            }),
            makeRes()
          );

        const [sql] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'created_at >'
        );

        expect(sql).toContain(
          'created_at ='
        );

        expect(sql).toContain(
          'id <'
        );

        expect(sql).toContain(
          'ORDER BY created_at ASC, id DESC'
        );
      }
    );

    test(
      'amount desc null cursor preserves NULLS FIRST seek',
      async () => {
        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'amount',
            sort_order: 'desc',
            value: null,
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'amount',
              sort_order: 'desc',
            }),
            makeRes()
          );

        const [sql, params] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'amount IS NULL'
        );

        expect(sql).toContain(
          'OR amount IS NOT NULL'
        );

        expect(sql).toContain(
          'ORDER BY amount DESC NULLS FIRST, id DESC'
        );

        expect(params).toContain(ID_2);
      }
    );

    test(
      'amount desc non-null cursor preserves exact decimal string',
      async () => {
        const exactAmount =
          '12345678901234567890.123456789';

        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'amount',
            sort_order: 'desc',
            value: exactAmount,
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'amount',
              sort_order: 'desc',
            }),
            makeRes()
          );

        const [sql, params] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'amount <'
        );

        expect(sql).toContain(
          '::numeric'
        );

        expect(params).toContain(
          exactAmount
        );
      }
    );

    test(
      'amount asc null cursor only seeks remaining null rows',
      async () => {
        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'amount',
            sort_order: 'asc',
            value: null,
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'amount',
              sort_order: 'asc',
            }),
            makeRes()
          );

        const [sql] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'amount IS NULL'
        );

        expect(sql).toContain(
          'id <'
        );

        expect(sql).toContain(
          'ORDER BY amount ASC NULLS LAST, id DESC'
        );
      }
    );

    test(
      'amount asc non-null cursor includes later null rows',
      async () => {
        const cursor =
          encodeCursor({
            v: 1,
            sort_by: 'amount',
            sort_order: 'asc',
            value: '20.00',
            id: ID_2,
          });

        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'amount',
              sort_order: 'asc',
            }),
            makeRes()
          );

        const [sql] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'amount >'
        );

        expect(sql).toContain(
          'OR amount IS NULL'
        );
      }
    );

    test.each([
      [
        'malformed',
        'definitely-invalid',
      ],
      [
        'version missing',
        encodeCursor({
          sort_by: 'date',
          sort_order: 'desc',
          value:
            '2026-09-15T12:00:00.000Z',
          id: ID_1,
        }),
      ],
      [
        'wrong version',
        encodeCursor({
          v: 2,
          sort_by: 'date',
          sort_order: 'desc',
          value:
            '2026-09-15T12:00:00.000Z',
          id: ID_1,
        }),
      ],
      [
        'sort context mismatch',
        encodeCursor({
          v: 1,
          sort_by: 'amount',
          sort_order: 'desc',
          value: '10.00',
          id: ID_1,
        }),
      ],
      [
        'non canonical date',
        encodeCursor({
          v: 1,
          sort_by: 'date',
          sort_order: 'desc',
          value:
            '2026-09-15 12:00:00Z',
          id: ID_1,
        }),
      ],
      [
        'exponent amount',
        encodeCursor({
          v: 1,
          sort_by: 'amount',
          sort_order: 'desc',
          value: '1e6',
          id: ID_1,
        }),
      ],
    ])(
      '%s cursor returns 422 without querying database',
      async (_name, cursor) => {
        const res = makeRes();

        await controller
          .listTransactionsCursor(
            makeReq({
              cursor,
              sort_by: 'date',
              sort_order: 'desc',
            }),
            res
          );

        expect(mockQuery)
          .not.toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(422);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            code: 'INVALID_CURSOR',
            message:
              'The pagination cursor is invalid or expired.',
          });
      }
    );

    test(
      'representative legacy filters remain present on cursor endpoint',
      async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [],
        });

        await controller
          .listTransactionsCursor(
            makeReq({
              provider: 'mtn',
              transaction_type:
                'buy_airtime',
              status: 'completed',
              search: '024000',
              from_date:
                '2026-09-01T00:00:00.000Z',
              to_date:
                '2026-09-30T23:59:59.999Z',
              sim_iccid: 'iccid-1',
              sim_slot: '1',
            }),
            makeRes()
          );

        const [sql, params] =
          mockQuery.mock.calls[0];

        expect(sql).toContain(
          'provider ='
        );

        expect(sql).toContain(
          'transaction_type ='
        );

        expect(sql).toContain(
          'status ='
        );

        expect(sql).toContain(
          'sim_iccid ='
        );

        expect(sql).toContain(
          'sim_slot ='
        );

        expect(sql).toContain(
          'created_at >='
        );

        expect(sql).toContain(
          'created_at <='
        );

        expect(sql).toContain(
          'reference ILIKE'
        );

        expect(params).toContain('mtn');
        expect(params).toContain(
          'buy_airtime'
        );
        expect(params).toContain(
          'completed'
        );
        expect(params).toContain(
          'iccid-1'
        );
        expect(params).toContain(1);
        expect(params).toContain(
          '%024000%'
        );
      }
    );
  }
);
