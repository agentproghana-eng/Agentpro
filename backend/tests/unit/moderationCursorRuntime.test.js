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

const controller = require(
  '../../src/controllers/agentCommunityEnhancementController'
);

const {
  encodeFeedCursor,
} = require('../../src/utils/feedCursor');

const POST_ID =
  '11111111-1111-4111-8111-111111111111';

const POST_ID_2 =
  '22222222-2222-4222-8222-222222222222';

const HISTORY_ID =
  '33333333-3333-4333-8333-333333333333';

function makeReq(query = {}) {
  return {
    query,
    user: {
      id: 'admin-1',
      role: 'superuser',
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

function post(id, createdAt) {
  return {
    id,
    is_pinned: false,
    is_urgent: false,
    created_at: createdAt,
  };
}

describe('moderation posts cursor runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('first page uses limit+1 and emits cursor', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        post(
          POST_ID,
          '2026-09-15T10:00:00.000Z'
        ),
        post(
          POST_ID_2,
          '2026-09-15T09:00:00.000Z'
        ),
      ],
    });

    const req = makeReq({
      limit: '1',
    });
    const res = makeRes();

    await controller.listModerationPostsCursor(
      req,
      res,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, values] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'post.is_pinned DESC'
    );
    expect(sql).toContain(
      'post.is_urgent DESC'
    );
    expect(sql).toContain(
      'post.created_at DESC'
    );
    expect(sql).toContain(
      'post.id DESC'
    );

    expect(values).toEqual([2]);

    const body = res.json.mock.calls[0][0];

    expect(body.data).toHaveLength(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.has_more).toBe(true);
    expect(
      typeof body.pagination.next_cursor
    ).toBe('string');
  });

  test('preserves filters on a second cursor page', async () => {
    const cursor = encodeFeedCursor({
      is_pinned: false,
      is_urgent: false,
      created_at:
        '2026-09-15T09:00:00.000Z',
      id: POST_ID_2,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = makeReq({
      status: 'active',
      post_type: 'question',
      pinned: 'false',
      official: 'true',
      urgent: 'false',
      search: 'Kwame',
      cursor,
      limit: '25',
    });
    const res = makeRes();

    await controller.listModerationPostsCursor(
      req,
      res,
    );

    const [sql, values] = mockQuery.mock.calls[0];

    expect(sql).toContain('post.status = $1');
    expect(sql).toContain('post.post_type = $2');
    expect(sql).toContain('post.is_pinned = $3');
    expect(sql).toContain('post.is_official = $4');
    expect(sql).toContain('post.is_urgent = $5');

    expect(sql).toContain(
      "post.content ILIKE '%' || $6 || '%'"
    );

    expect(sql).toContain(
      'post.is_pinned::int'
    );

    expect(values).toEqual([
      'active',
      'question',
      false,
      true,
      false,
      'Kwame',
      'Kwame',
      'Kwame',
      'Kwame',
      false,
      false,
      '2026-09-15T09:00:00.000Z',
      POST_ID_2,
      26,
    ]);
  });

  test('rejects malformed moderation cursor', async () => {
    const req = makeReq({
      cursor: 'broken',
    });
    const res = makeRes();

    await controller.listModerationPostsCursor(
      req,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'INVALID_CURSOR',
      message: 'Invalid moderation cursor',
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('caps moderation limit at 100', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = makeReq({
      limit: '9999',
    });
    const res = makeRes();

    await controller.listModerationPostsCursor(
      req,
      res,
    );

    expect(mockQuery.mock.calls[0][1]).toEqual([
      101,
    ]);

    expect(
      res.json.mock.calls[0][0].pagination.limit
    ).toBe(100);
  });

  test('rejects invalid post type before database call', async () => {
    const req = makeReq({
      post_type: 'invalid-type',
    });
    const res = makeRes();

    await controller.listModerationPostsCursor(
      req,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('moderation history cursor runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preserves history filters and cursor seek', async () => {
    const cursor = encodeFeedCursor({
      created_at:
        '2026-09-15T08:00:00.000Z',
      id: HISTORY_ID,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = makeReq({
      post_id: POST_ID,
      action: 'remove',
      cursor,
      limit: '30',
    });
    const res = makeRes();

    await controller.listModerationHistoryCursor(
      req,
      res,
    );

    const [sql, values] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'history.post_id = $1'
    );
    expect(sql).toContain(
      'history.action = $2'
    );
    expect(sql).toContain(
      '(history.created_at, history.id) <'
    );
    expect(sql).toContain(
      'history.created_at DESC'
    );
    expect(sql).toContain(
      'history.id DESC'
    );

    expect(values).toEqual([
      POST_ID,
      'remove',
      '2026-09-15T08:00:00.000Z',
      HISTORY_ID,
      31,
    ]);
  });

  test('rejects malformed history cursor', async () => {
    const req = makeReq({
      cursor: 'broken',
    });
    const res = makeRes();

    await controller.listModerationHistoryCursor(
      req,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'INVALID_CURSOR',
      message: 'Invalid moderation history cursor',
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
