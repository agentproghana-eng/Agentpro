'use strict';

jest.mock(
  '../../src/controllers/agentCommunityEnhancementController',
  () => ({
    listModerationPostsCursor: jest.fn(),
    listModerationPosts: jest.fn(),
    listModerationHistoryCursor: jest.fn(),
    listModerationHistory: jest.fn(),
    listReports: jest.fn(),
    resolveReport: jest.fn(),
    updatePostModeration: jest.fn(),
    listSavedPosts: jest.fn(),
    listBlockedUsers: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    savePost: jest.fn(),
    unsavePost: jest.fn(),
    reportPost: jest.fn(),
    acceptAnswer: jest.fn(),
    clearAcceptedAnswer: jest.fn(),
    reportComment: jest.fn(),
  })
);

jest.mock(
  '../../src/controllers/agentPostController',
  () => ({
    listPending: jest.fn(),
    moderatePost: jest.fn(),
    listFeedCursor: jest.fn(),
    listFeed: jest.fn(),
    getPost: jest.fn(),
    createPost: jest.fn(),
    deletePost: jest.fn(),
    toggleLike: jest.fn(),
    listComments: jest.fn(),
    addComment: jest.fn(),
    toggleCommentReaction: jest.fn(),
  })
);

jest.mock('../../src/middleware/rateLimit', () => ({
  uploadLimiter: (req, res, next) => next(),
}));

const router = require(
  '../../src/routes/agentPost.routes'
);

function findAuthorize(path) {
  const layer = router.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      entry.route.methods.get
  );

  if (!layer) {
    throw new Error(`Route not found: ${path}`);
  }

  return layer.route.stack[0].handle;
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
}

describe('moderation cursor authorization runtime', () => {
  test.each([
    '/moderation/posts/cursor',
    '/moderation/history/cursor',
  ])(
    '%s rejects a non-superuser',
    (path) => {
      const middleware = findAuthorize(path);

      const req = {
        user: {
          id: 'agent-1',
          role: 'agent',
        },
      };
      const res = makeRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  );

  test.each([
    '/moderation/posts/cursor',
    '/moderation/history/cursor',
  ])(
    '%s allows a superuser',
    (path) => {
      const middleware = findAuthorize(path);

      const req = {
        user: {
          id: 'admin-1',
          role: 'superuser',
        },
      };
      const res = makeRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  );
});
