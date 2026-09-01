"use strict";

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

const agent = require("../../src/controllers/agentPostController");

const personal = require("../../src/controllers/personalCommunityController");

const USER_ID = "11111111-1111-4111-8111-111111111111";

const POST_ID = "22222222-2222-4222-8222-222222222222";

const COMMENT_ID = "33333333-3333-4333-8333-333333333333";

function res() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function postReq() {
  return {
    user: {
      id: USER_ID,
    },
    params: {
      post_id: POST_ID,
    },
    body: {},
  };
}

describe("Community comment visibility boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Agent comment listing returns 404 before reading comments when post is invisible", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const response = res();

    await agent.listComments(postReq(), response);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("FROM agent_posts p");

    expect(sql).toContain("p.status = 'active'");

    expect(sql).toContain("p.status = 'pending_review'");

    expect(sql).toContain("p.author_id = $2");

    expect(sql).toContain("agent_community_blocks");

    expect(params).toEqual([POST_ID, USER_ID]);

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("Agent comment creation returns 404 before parent lookup or insert when post is invisible", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const response = res();

    await agent.addComment(
      {
        ...postReq(),
        body: {
          content: "Hidden post comment",
        },
      },
      response,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(String(mockQuery.mock.calls[0][0])).toContain("FROM agent_posts p");

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("Agent comment reaction resolves parent post and refuses an invisible post", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            post_id: POST_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const response = res();

    await agent.toggleCommentReaction(
      {
        user: {
          id: USER_ID,
        },
        params: {
          comment_id: COMMENT_ID,
        },
        body: {
          reaction_type: "like",
        },
      },
      response,
    );

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "SELECT post_id FROM agent_post_comments",
    );

    expect(String(mockQuery.mock.calls[1][0])).toContain("FROM agent_posts p");

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("Personal comment listing does not make removed posts readable", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const response = res();

    await personal.listComments(postReq(), response);

    const [sql] = mockQuery.mock.calls[0];

    expect(sql).toContain("FROM personal_posts p");

    expect(sql).toContain("p.status = 'active'");

    expect(sql).toContain("p.status = 'pending_review'");

    expect(sql).not.toContain("p.status = 'removed'");

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("Personal comment creation returns 404 when parent post is invisible", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const response = res();

    await personal.addComment(
      {
        ...postReq(),
        body: {
          content: "Not allowed",
        },
      },
      response,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "FROM personal_posts p",
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("Personal comment reaction cannot bypass parent post visibility", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            post_id: POST_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const response = res();

    await personal.toggleCommentReaction(
      {
        user: {
          id: USER_ID,
        },
        params: {
          comment_id: COMMENT_ID,
        },
        body: {
          reaction_type: "love",
        },
      },
      response,
    );

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "SELECT post_id FROM personal_post_comments",
    );

    expect(String(mockQuery.mock.calls[1][0])).toContain(
      "FROM personal_posts p",
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });
});
