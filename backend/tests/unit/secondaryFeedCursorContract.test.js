const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8'
  );
}

describe('Secondary feed cursor pagination contract', () => {
  test('Marketplace My Ads has cursor route', () => {
    const marketplace = source(
      'src/routes/marketplace.routes.js'
    );

    expect(marketplace).toContain(
      "mpRouter.get('/mine/cursor', async (req, res) =>"
    );

    expect(marketplace).toContain(
      'a.created_at DESC'
    );

    expect(marketplace).toContain(
      'a.id DESC'
    );

    expect(marketplace).toContain(
      "code: 'INVALID_CURSOR'"
    );
  });

  test('Marketplace reviews received has cursor route without exact total', () => {
    const marketplace = source(
      'src/routes/marketplace.routes.js'
    );

    const start = marketplace.indexOf(
      "mpRouter.get('/reviews/received/cursor'"
    );

    const end = marketplace.indexOf(
      "mpRouter.get('/reviews/received',",
      start
    );

    const cursorRoute = marketplace.slice(start, end);

    expect(cursorRoute).toContain(
      'ar.created_at DESC'
    );

    expect(cursorRoute).toContain(
      'ar.id DESC'
    );

    expect(cursorRoute).toContain(
      'next_cursor'
    );

    expect(cursorRoute).not.toContain(
      'SELECT COUNT(*)::int AS total'
    );

    expect(cursorRoute).not.toContain(
      ' OFFSET '
    );
  });

  test('superuser moderation cursor routes remain protected', () => {
    const routes = source(
      'src/routes/agentPost.routes.js'
    );

    expect(routes).toContain(
      '"/moderation/posts/cursor"'
    );

    expect(routes).toContain(
      'enhancementController.listModerationPostsCursor'
    );

    expect(routes).toContain(
      '"/moderation/history/cursor"'
    );

    expect(routes).toContain(
      'enhancementController.listModerationHistoryCursor'
    );
  });

  test('moderation cursor handlers avoid OFFSET and exact total', () => {
    const controller = source(
      'src/controllers/agentCommunityEnhancementController.js'
    );

    const postsStart = controller.indexOf(
      'exports.listModerationPostsCursor'
    );

    const historyStart = controller.indexOf(
      'exports.listModerationHistoryCursor'
    );

    const postsCursor = controller.slice(
      postsStart,
      historyStart
    );

    const historyCursor = controller.slice(
      historyStart
    );

    expect(postsCursor).toContain(
      'post.id DESC'
    );
    expect(postsCursor).toContain(
      'next_cursor'
    );
    expect(postsCursor).not.toContain(
      ' OFFSET '
    );
    expect(postsCursor).not.toContain(
      'AS total'
    );

    expect(historyCursor).toContain(
      'history.id DESC'
    );
    expect(historyCursor).toContain(
      'next_cursor'
    );
    expect(historyCursor).not.toContain(
      ' OFFSET '
    );
    expect(historyCursor).not.toContain(
      'AS total'
    );
  });
});

describe('Secondary moderation cursor runtime guards', () => {
  test('controller defines UUID validation used by valid cursors', () => {
    const controller = source(
      'src/controllers/agentCommunityEnhancementController.js'
    );

    expect(controller).toContain(
      'const UUID_PATTERN ='
    );

    expect(controller).toContain(
      '!UUID_PATTERN.test(cursor.id)'
    );
  });
});
