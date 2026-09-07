const fs = require("fs");
const path = require("path");

jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock("../../src/controllers/agentPostController", () => ({
  detectAdvertisement: jest.fn(),
}));

jest.mock("../../src/config/cloudinary", () => ({
  uploadAudio: jest.fn(),
}));

const {
  query,
} = require("../../src/config/database");

const controller =
  require("../../src/controllers/personalCommunityController");

const POST_ID =
  "11111111-1111-4111-8111-111111111111";

const MODERATOR_ID =
  "22222222-2222-4222-8222-222222222222";

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

describe("Personal Community admin moderation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("lists Personal posts awaiting moderation", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: POST_ID,
          status: "pending_review",
        },
      ],
    });

    const res = makeResponse();

    await controller.listPending({}, res);

    expect(query).toHaveBeenCalledTimes(1);

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain("FROM personal_posts p");
    expect(sql).toContain("WHERE p.status = $1");
    expect(params).toEqual(["pending_review"]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  test("approves only a pending Personal post", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: POST_ID,
          status: "active",
        },
      ],
    });

    const req = {
      params: {
        post_id: POST_ID,
      },
      body: {
        action: "approve",
      },
      user: {
        id: MODERATOR_ID,
      },
    };

    const res = makeResponse();

    await controller.moderatePost(req, res);

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain("UPDATE personal_posts");
    expect(sql).toContain("reviewed_by = $2");
    expect(sql).toContain("reviewed_at = NOW()");
    expect(sql).toContain("AND status = $5");

    expect(params).toEqual([
      "active",
      MODERATOR_ID,
      null,
      POST_ID,
      "pending_review",
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("rejects pending Personal post with moderation reason", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: POST_ID,
          status: "removed",
        },
      ],
    });

    const req = {
      params: {
        post_id: POST_ID,
      },
      body: {
        action: "reject",
        removed_reason: "Rejected by administrator",
      },
      user: {
        id: MODERATOR_ID,
      },
    };

    const res = makeResponse();

    await controller.moderatePost(req, res);

    expect(query.mock.calls[0][1]).toEqual([
      "removed",
      MODERATOR_ID,
      "Rejected by administrator",
      POST_ID,
      "pending_review",
    ]);

    expect(res.statusCode).toBe(200);
  });

  test("rejects unsupported moderation actions", async () => {
    const req = {
      params: {
        post_id: POST_ID,
      },
      body: {
        action: "remove_everything",
      },
      user: {
        id: MODERATOR_ID,
      },
    };

    const res = makeResponse();

    await controller.moderatePost(req, res);

    expect(res.statusCode).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  test("returns 404 when post is no longer pending", async () => {
    query.mockResolvedValueOnce({
      rows: [],
    });

    const req = {
      params: {
        post_id: POST_ID,
      },
      body: {
        action: "approve",
      },
      user: {
        id: MODERATOR_ID,
      },
    };

    const res = makeResponse();

    await controller.moderatePost(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe(
      "Pending post not found"
    );
  });

  test("superuser routes precede Personal-account gate", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/routes/personalCommunity.routes.js"
      ),
      "utf8"
    );

    const authenticateAt =
      source.indexOf("router.use(authenticate);");

    const pendingAt = source.indexOf(
      "'/moderation/pending'"
    );

    const moderateAt = source.indexOf(
      "'/posts/:post_id/moderate'"
    );

    const personalGateAt = source.indexOf(
      "router.use(requirePersonalAccount);"
    );

    expect(authenticateAt).toBeGreaterThanOrEqual(0);
    expect(pendingAt).toBeGreaterThan(authenticateAt);
    expect(moderateAt).toBeGreaterThan(pendingAt);
    expect(personalGateAt).toBeGreaterThan(moderateAt);

    expect(source).toContain(
      "authorize('superuser')"
    );
  });

  test("Admin Portal loads and filters both Community queues", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../../admin_portal/src/pages.jsx"
      ),
      "utf8"
    );

    expect(source).toContain(
      "API.get('/agent-posts/moderation/pending')"
    );

    expect(source).toContain(
      "API.get('/personal-community/moderation/pending')"
    );

    expect(source).toContain(
      "value={communityFilter}"
    );

    expect(source).toContain(
      '<option value="personal">'
    );

    expect(source).toContain(
      "Personal Community"
    );

    expect(source).toContain(
      "`/personal-community/posts/${post.id}/moderate`"
    );

    expect(source).toContain(
      "data={filteredPendingPosts}"
    );
  });
});
