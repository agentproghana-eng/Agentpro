'use strict';

const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../src/config/cloudinary', () => ({
  uploadFile: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/paystackService', () => ({
  amountToMinorUnits: jest.fn(),
  initializeTransaction: jest.fn(),
  verifyTransaction: jest.fn(),
}));

jest.mock(
  '../../src/services/businessHubPaystackPaymentService',
  () => ({
    fulfillBusinessHubPaystackTransaction: jest.fn(),
  })
);

jest.mock('../../src/middleware/rateLimit', () => ({
  uploadLimiter: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  authorize: () => (req, res, next) => next(),
}));

const router = require('../../src/routes/marketplace.routes');
const {
  encodeFeedCursor,
} = require('../../src/utils/feedCursor');

const SELLER_ID =
  '11111111-1111-4111-8111-111111111111';

const REVIEW_1 =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const REVIEW_2 =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const REVIEW_3 =
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function findRouteHandler(path) {
  const layer = router.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      entry.route.methods.get
  );

  if (!layer) {
    throw new Error(`Route not found: ${path}`);
  }

  const handlers = layer.route.stack.map(
    (entry) => entry.handle
  );

  return handlers.at(-1);
}

const handler = findRouteHandler(
  '/reviews/received/cursor'
);

function makeReq(query = {}) {
  return {
    query,
    user: {
      id: SELLER_ID,
      role: 'business_owner',
    },
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);

  return res;
}

function review(
  id,
  createdAt,
  advertisementId =
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
) {
  return {
    id,
    advertisement_id: advertisementId,
    rating: 5,
    review: 'Great service',
    created_at: createdAt,
    ad_title: 'Test ad',
    reviewer_first_name: 'Test',
    reviewer_last_name: 'Buyer',
    reviewer_profile_image_url: null,
  };
}

describe('received reviews cursor runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns first page and emits next cursor', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          review(
            REVIEW_1,
            '2026-09-15T10:00:00.000Z'
          ),
          review(
            REVIEW_2,
            '2026-09-15T09:00:00.000Z'
          ),
          review(
            REVIEW_3,
            '2026-09-15T08:00:00.000Z'
          ),
        ],
      })
      .mockResolvedValueOnce({
        rows: [{
          id:
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          title: 'Test ad',
          review_count: 3,
        }],
      });

    const req = makeReq({
      limit: '2',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledTimes(1);

    const body = res.json.mock.calls[0][0];

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toMatchObject({
      limit: 2,
      has_more: true,
    });

    expect(
      typeof body.pagination.next_cursor
    ).toBe('string');

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'ar.seller_id = $1'
    );
    expect(sql).toContain(
      'ORDER BY'
    );
    expect(sql).toContain(
      'ar.created_at DESC'
    );
    expect(sql).toContain(
      'ar.id DESC'
    );

    expect(params).toEqual([
      SELLER_ID,
      3,
    ]);
  });

  test('uses cursor seek predicate on second page', async () => {
    const cursor = encodeFeedCursor({
      created_at:
        '2026-09-15T09:00:00.000Z',
      id: REVIEW_2,
    });

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          review(
            REVIEW_3,
            '2026-09-15T08:00:00.000Z'
          ),
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = makeReq({
      cursor,
      limit: '20',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalled();

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      '(ar.created_at, ar.id) <'
    );

    expect(params).toEqual([
      SELLER_ID,
      '2026-09-15T09:00:00.000Z',
      REVIEW_2,
      21,
    ]);

    const body = res.json.mock.calls[0][0];

    expect(body.pagination.has_more).toBe(false);
    expect(body.pagination.next_cursor).toBeNull();
  });

  test('rejects malformed cursor with 422', async () => {
    const req = makeReq({
      cursor: 'not-a-valid-cursor',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'INVALID_CURSOR',
      message: 'Invalid review cursor',
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('caps requested limit at 100', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = makeReq({
      limit: '9999',
    });
    const res = makeRes();

    await handler(req, res);

    const params = mockQuery.mock.calls[0][1];

    expect(params).toEqual([
      SELLER_ID,
      101,
    ]);

    const body = res.json.mock.calls[0][0];

    expect(body.pagination.limit).toBe(100);
  });

  test('preserves ad and rating filters with cursor', async () => {
    const adId =
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const cursor = encodeFeedCursor({
      created_at:
        '2026-09-15T09:00:00.000Z',
      id: REVIEW_2,
    });

    mockQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = makeReq({
      ad_id: adId,
      rating: '4',
      cursor,
      limit: '25',
    });
    const res = makeRes();

    await handler(req, res);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'ar.seller_id = $1'
    );
    expect(sql).toContain(
      'ar.advertisement_id = $2'
    );
    expect(sql).toContain(
      'ar.rating = $3'
    );
    expect(sql).toContain(
      '(ar.created_at, ar.id) <'
    );

    expect(params).toEqual([
      SELLER_ID,
      adId,
      4,
      '2026-09-15T09:00:00.000Z',
      REVIEW_2,
      26,
    ]);
  });

  test('rejects invalid rating without querying database', async () => {
    const req = makeReq({
      rating: '6',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
