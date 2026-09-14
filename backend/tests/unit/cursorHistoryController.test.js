const mockQuery = jest.fn();

jest.mock("../../src/config/database", () => ({
  query: (...args) => mockQuery(...args),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const controller =
  require("../../src/controllers/cursorHistoryController");

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

describe("cursorHistoryController", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("transaction history uses keyset pagination without COUNT or OFFSET", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-09-14T12:00:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-09-14T11:00:00.000Z",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-09-14T10:00:00.000Z",
        },
      ],
    });

    const req = {
      query: { limit: "2" },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "agent",
        company_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    };

    const res = makeResponse();

    await controller.listTransactions(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.has_more).toBe(true);
    expect(res.body.meta.next_cursor).toEqual(expect.any(String));

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      "ORDER BY t.created_at DESC, t.id DESC",
    );
    expect(sql).not.toContain(" OFFSET ");
    expect(sql).not.toContain("COUNT(*)");
    expect(sql).toContain("t.agent_id = $1");

    // requested limit + 1
    expect(params[params.length - 1]).toBe(3);
  });

  test("transaction cursor becomes a tuple seek condition", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const cursor =
      controller._cursorInternals.encodeCursor({
        id: "11111111-1111-4111-8111-111111111111",
        created_at: "2026-09-14T12:00:00.000Z",
      });

    const req = {
      query: {
        cursor,
        limit: "20",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "agent",
      },
    };

    const res = makeResponse();

    await controller.listTransactions(req, res);

    expect(res.statusCode).toBe(200);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      "(t.created_at, t.id) <",
    );
    expect(params).toContain(
      "2026-09-14T12:00:00.000Z",
    );
    expect(params).toContain(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  test("invalid cursor fails before querying the database", async () => {
    const req = {
      query: {
        cursor: "not-a-valid-cursor",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "agent",
      },
    };

    const res = makeResponse();

    await controller.listTransactions(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("INVALID_CURSOR");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("notification cursor avoids exact total count", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            created_at: "2026-09-14T12:00:00.000Z",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            created_at: "2026-09-14T11:00:00.000Z",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            created_at: "2026-09-14T10:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "7" }],
      });

    const req = {
      query: {
        limit: "2",
        unread_only: "true",
      },
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    };

    const res = makeResponse();

    await controller.listNotifications(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.has_more).toBe(true);
    expect(res.body.meta.unread).toBe(7);

    const dataSql = mockQuery.mock.calls[0][0];
    const unreadSql = mockQuery.mock.calls[1][0];

    expect(dataSql).toContain(
      "ORDER BY created_at DESC, id DESC",
    );
    expect(dataSql).not.toContain(" OFFSET ");
    expect(dataSql).not.toContain("COUNT(*)");

    // Only the UI unread badge count remains. There is no exact
    // total-result count for every history page.
    expect(unreadSql).toContain("is_read = FALSE");
  });
});
