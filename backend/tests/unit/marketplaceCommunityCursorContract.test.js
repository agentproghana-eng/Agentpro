const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8'
  );
}

describe('Marketplace and Community cursor pagination contract', () => {
  test('Agent Community exposes stable ranked cursor pagination', () => {
    const controller = source(
      'src/controllers/agentPostController.js'
    );
    const routes = source(
      'src/routes/agentPost.routes.js'
    );

    expect(routes).toContain(
      'router.get("/cursor", agentPostController.listFeedCursor);'
    );

    expect(controller).toContain(
      'exports.listFeedCursor = async (req, res) =>'
    );

    expect(controller).toContain(
      'p.is_pinned DESC,'
    );
    expect(controller).toContain(
      'p.is_urgent DESC,'
    );
    expect(controller).toContain(
      'p.created_at DESC,'
    );
    expect(controller).toContain(
      'p.id DESC'
    );

    expect(controller).toContain(
      'next_cursor:'
    );
    expect(controller).toContain(
      'code: "INVALID_CURSOR"'
    );
  });

  test('Personal Community exposes chronological cursor pagination', () => {
    const controller = source(
      'src/controllers/personalCommunityController.js'
    );
    const routes = source(
      'src/routes/personalCommunity.routes.js'
    );

    expect(routes).toContain(
      "router.get('/feed/cursor', personalCommunityController.listFeedCursor);"
    );

    expect(controller).toContain(
      'exports.listFeedCursor = async (req, res) =>'
    );

    expect(controller).toContain(
      'p.created_at DESC,'
    );
    expect(controller).toContain(
      'p.id DESC'
    );
    expect(controller).toContain(
      'next_cursor:'
    );
  });

  test('Marketplace exposes newest cursor feed without replacing legacy browse', () => {
    const marketplace = source(
      'src/routes/marketplace.routes.js'
    );

    expect(marketplace).toContain(
      "mpRouter.get('/cursor', async (req, res) =>"
    );

    expect(marketplace).toContain(
      "ORDER BY\n         a.published_at DESC NULLS LAST,\n         a.id DESC"
    );

    expect(marketplace).toContain(
      "code: 'INVALID_CURSOR'"
    );

    expect(marketplace).toContain(
      "mpRouter.get('/', async (req, res) =>"
    );
  });
});
