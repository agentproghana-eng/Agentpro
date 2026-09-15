const mockQuery = jest.fn();

jest.mock("../../src/config/database", () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock("../../src/config/cloudinary", () => ({
  uploadAudio: jest.fn(),
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(),
  })),
}));

const agentController =
  require("../../src/controllers/agentPostController");

const personalController =
  require("../../src/controllers/personalCommunityController");

const {
  encodeFeedCursor,
} = require("../../src/utils/feedCursor");

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("Community cursor pagination", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("Agent Community uses limit+1 and emits next cursor", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-09-15T10:00:00.000Z",
          is_pinned: true,
          is_urgent: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-09-15T09:00:00.000Z",
          is_pinned: true,
          is_urgent: false,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-09-15T08:00:00.000Z",
          is_pinned: false,
          is_urgent: false,
        },
      ],
    });

    const req = {
      query: { limit: "2" },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await agentController.listFeedCursor(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.has_more).toBe(true);
    expect(res.body.pagination.next_cursor)
      .toEqual(expect.any(String));

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("p.is_pinned DESC");
    expect(sql).toContain("p.is_urgent DESC");
    expect(sql).toContain("p.created_at DESC");
    expect(sql).toContain("p.id DESC");
    expect(sql).not.toContain(" OFFSET ");
    expect(params[params.length - 1]).toBe(3);
  });

  test("Agent Community cursor becomes composite seek condition", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const cursor = encodeFeedCursor({
      is_pinned: true,
      is_urgent: false,
      created_at: "2026-09-15T09:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
    });

    const req = {
      query: {
        cursor,
        limit: "20",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await agentController.listFeedCursor(req, res);

    expect(res.statusCode).toBe(200);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("p.is_pinned::int");
    expect(sql).toContain("p.is_urgent::int");
    expect(sql).toContain("p.created_at");
    expect(sql).toContain("p.id");

    expect(params).toContain(true);
    expect(params).toContain(false);
    expect(params).toContain(
      "2026-09-15T09:00:00.000Z"
    );
    expect(params).toContain(
      "22222222-2222-4222-8222-222222222222"
    );
  });

  test("Agent Community rejects invalid cursor before DB query", async () => {
    const req = {
      query: {
        cursor: "not-a-valid-cursor",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await agentController.listFeedCursor(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("INVALID_CURSOR");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("Personal Community uses chronological keyset pagination", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-09-15T10:00:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-09-15T09:00:00.000Z",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-09-15T08:00:00.000Z",
        },
      ],
    });

    const req = {
      query: { limit: "2" },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await personalController.listFeedCursor(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.has_more).toBe(true);
    expect(res.body.pagination.next_cursor)
      .toEqual(expect.any(String));

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("p.created_at DESC");
    expect(sql).toContain("p.id DESC");
    expect(sql).not.toContain(" OFFSET ");
    expect(params[params.length - 1]).toBe(3);
  });

  test("Personal Community rejects malformed cursor before DB query", async () => {
    const req = {
      query: {
        cursor: "broken",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await personalController.listFeedCursor(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("INVALID_CURSOR");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
