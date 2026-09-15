const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../../..', relativePath),
    'utf8'
  );
}

describe('Flutter Marketplace and Community cursor contract', () => {
  test('Agent Community consumes cursor pagination', () => {
    const sourceText = source(
      'flutter_app/lib/features/community/community_feed_screen.dart'
    );

    expect(sourceText).toContain(
      "'/agent-posts/cursor'"
    );
    expect(sourceText).toContain(
      "pagination['next_cursor']"
    );
    expect(sourceText).not.toContain(
      "int _page = 1;"
    );
  });

  test('Personal Community consumes cursor pagination', () => {
    const sourceText = source(
      'flutter_app/lib/features/personal_community/personal_community_feed_screen.dart'
    );

    expect(sourceText).toContain(
      "'/personal-community/feed/cursor'"
    );
    expect(sourceText).toContain(
      "pagination['next_cursor']"
    );
    expect(sourceText).toContain(
      'final _scrollController = ScrollController();'
    );
  });

  test('Marketplace newest feed uses cursor route while alternate sorts remain legacy', () => {
    const sourceText = source(
      'flutter_app/lib/features/marketplace/marketplace_screen.dart'
    );

    expect(sourceText).toContain(
      "'/marketplace/cursor'"
    );

    expect(sourceText).toContain(
      "_sort == 'newest'"
    );

    expect(sourceText).toContain(
      ": '/marketplace';"
    );

    expect(sourceText).toContain(
      "'sort': 'highest_rated'"
    );

    expect(sourceText).toContain(
      "'sort': 'most_viewed'"
    );
  });
});
