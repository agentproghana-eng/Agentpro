const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../../..', relativePath),
    'utf8'
  );
}

describe('Secondary feed client cursor contract', () => {
  test('My Ads uses cursor pagination', () => {
    const text = source(
      'flutter_app/lib/features/marketplace/my_ads_screen.dart'
    );

    expect(text).toContain(
      "'/marketplace/mine/cursor'"
    );
    expect(text).toContain(
      "final ScrollController _scrollController"
    );
    expect(text).toContain(
      "'cursor': _nextCursor"
    );
    expect(text).toContain(
      "_loadingMore"
    );
  });

  test('Customer Reviews uses cursor pagination', () => {
    const text = source(
      'flutter_app/lib/features/marketplace/customer_reviews_screen.dart'
    );

    expect(text).toContain(
      "'/marketplace/reviews/received/cursor'"
    );
    expect(text).toContain(
      "final ScrollController _scrollController"
    );
    expect(text).toContain(
      "'cursor': _nextCursor"
    );
    expect(text).not.toContain(
      "'limit': 100"
    );
  });

  test('Admin moderation uses cursor routes and incremental loading', () => {
    const text = source(
      'admin_portal/src/pages.jsx'
    );

    expect(text).toContain(
      "'/agent-posts/moderation/posts/cursor'"
    );
    expect(text).toContain(
      "'/agent-posts/moderation/history/cursor'"
    );
    expect(text).toContain(
      'loadMorePosts'
    );
    expect(text).toContain(
      'loadMoreHistory'
    );
    expect(text).not.toContain(
      "API.get('/agent-posts/moderation/posts', {\n          params: { limit: 100 }"
    );
  });
  test('Admin moderation cursor loaders live inside CommunityModerationPage', () => {
    const text = source(
      'admin_portal/src/pages.jsx'
    );

    const moderationStart = text.indexOf(
      'export function CommunityModerationPage()'
    );

    expect(moderationStart).toBeGreaterThanOrEqual(0);

    const beforeModeration = text.slice(
      0,
      moderationStart
    );

    const moderationSection = text.slice(
      moderationStart
    );

    expect(beforeModeration).not.toContain(
      'const loadMorePosts = async () =>'
    );

    expect(beforeModeration).not.toContain(
      'const loadMoreHistory = async () =>'
    );

    expect(moderationSection).toContain(
      'const loadMorePosts = async () =>'
    );

    expect(moderationSection).toContain(
      'const loadMoreHistory = async () =>'
    );
  });

});
