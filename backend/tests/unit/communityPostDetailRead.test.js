"use strict";

const mockQuery = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("../../src/config/database", () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: (...args) => mockLoggerError(...args),
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

const agentPostController = require("../../src/controllers/agentPostController");

const personalCommunityController = require("../../src/controllers/personalCommunityController");

const USER_ID = "11111111-1111-4111-8111-111111111111";

const POST_ID = "22222222-2222-4222-8222-222222222222";

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function requestWithPostId(postId = POST_ID) {
  return {
    user: {
      id: USER_ID,
    },
    params: {
      post_id: postId,
    },
  };
}

describe("Community single-post read contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Agent detail returns the visible post with feed metadata", async () => {
    const post = {
      id: POST_ID,
      author_id: "33333333-3333-4333-8333-333333333333",
      status: "active",
      first_name: "Ama",
      last_name: "Mensah",
      role: "agent",
      is_saved: false,
      reaction_counts: {
        like: 2,
      },
      comment_count: 3,
      my_reaction: "like",
    };

    mockQuery.mockResolvedValueOnce({
      rows: [post],
    });

    const res = makeResponse();

    await agentPostController.getPost(requestWithPostId(), res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("FROM agent_posts p");
    expect(sql).toContain("p.id = $2");
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("p.status = 'pending_review'");
    expect(sql).toContain("p.author_id = $1");
    expect(sql).toContain("agent_saved_posts");
    expect(sql).toContain("agent_post_likes");
    expect(sql).toContain("agent_post_comments");
    expect(sql).toContain("agent_community_blocks");
    expect(sql).toContain("block.blocker_id = $1");
    expect(sql).toContain("block.blocked_user_id = p.author_id");

    expect(params).toEqual([USER_ID, POST_ID]);

    expect(res.status).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: post,
    });
  });

  test("Agent detail hides posts outside the feed visibility boundary", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const res = makeResponse();

    await agentPostController.getPost(requestWithPostId(), res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Post not found",
    });
  });

  test("Agent detail rejects malformed post IDs without querying PostgreSQL", async () => {
    const res = makeResponse();

    await agentPostController.getPost(requestWithPostId("not-a-uuid"), res);

    expect(mockQuery).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Post not found",
    });
  });

  test("Personal detail exposes active or own pending posts but never removed posts", async () => {
    const post = {
      id: POST_ID,
      author_id: "33333333-3333-4333-8333-333333333333",
      status: "active",
      first_name: "Kojo",
      last_name: "Asare",
      reaction_counts: {
        love: 1,
      },
      comment_count: 4,
      my_reaction: null,
    };

    mockQuery.mockResolvedValueOnce({
      rows: [post],
    });

    const res = makeResponse();

    await personalCommunityController.getPost(requestWithPostId(), res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("FROM personal_posts p");
    expect(sql).toContain("p.id = $2");
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("p.status = 'pending_review'");
    expect(sql).toContain("p.author_id = $1");
    expect(sql).toContain("personal_post_likes");
    expect(sql).toContain("personal_post_comments");

    expect(sql).not.toContain("p.status = 'removed'");

    expect(sql).not.toContain('p.status = "removed"');

    expect(params).toEqual([USER_ID, POST_ID]);

    expect(res.status).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: post,
    });
  });

  test("Personal detail returns 404 when the post is not visible", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const res = makeResponse();

    await personalCommunityController.getPost(requestWithPostId(), res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Post not found",
    });
  });

  test("Personal detail rejects malformed post IDs without querying PostgreSQL", async () => {
    const res = makeResponse();

    await personalCommunityController.getPost(
      requestWithPostId("invalid"),
      res,
    );

    expect(mockQuery).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Post not found",
    });
  });
});
