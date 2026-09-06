import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String source;
  late String detailSource;

  setUpAll(() {
    source = File(
      'lib/features/marketplace/marketplace_screen.dart',
    ).readAsStringSync();

    detailSource = File(
      'lib/features/marketplace/ad_detail_screen.dart',
    ).readAsStringSync();
  });

  test('Business Hub app bar keeps only the vertical menu action', () {
    expect(source, contains('Icons.more_vert'));
    expect(source, isNot(contains('Icons.more_horiz')));
    expect(source, isNot(contains("tooltip: 'Saved Ads'")));
    expect(source, isNot(contains("'My Ads'")));
  });

  test('Business Hub uses professional two-column item cards', () {
    expect(source, contains('crossAxisCount: 2'));
    expect(source, contains('childAspectRatio: 0.60'));
    expect(source, contains('maxLines: 2'));
    expect(source, contains('BoxFit.cover'));
    expect(source, contains('Icons.photo_library_outlined'));
    expect(source, contains('Icons.location_on_outlined'));
  });

  test('cards expose seller identity without seller-first home promotion', () {
    expect(source, contains("ad['seller_first_name']"));
    expect(source, contains("ad['seller_last_name']"));
    expect(source, contains("ad['company_name']"));
    expect(source, contains("ad['seller_verified']"));
    expect(source, isNot(contains('marketplace:home:featured-sellers')));
    expect(source, isNot(contains('_FeaturedBusinessCard')));
  });

  test(
    'Business Hub keeps the critical feed independent from secondary sections',
    () {
      final latestIndex = source.indexOf(
        'final rawLatest = await _cachedMarketplaceGet(',
      );

      final renderLatestIndex = source.indexOf(
        '_ads = _mapAds(rawLatest);',
      );

      final secondaryIndex = source.indexOf(
        'final secondaryResponses = await Future.wait<dynamic>([',
      );

      expect(
        latestIndex,
        greaterThanOrEqualTo(0),
        reason:
            'The main Marketplace feed must be loaded as the critical request.',
      );

      expect(
        renderLatestIndex,
        greaterThan(latestIndex),
        reason:
            'The main feed must become renderable as soon as it succeeds.',
      );

      expect(
        secondaryIndex,
        greaterThan(renderLatestIndex),
        reason:
            'Recommendations and other secondary sections must not block the main feed.',
      );

      expect(
        source,
        contains('.catchError((_) => null)'),
        reason:
            'Secondary Marketplace failures must be isolated from the critical feed.',
      );

      expect(
        source,
        contains('if (rawTopRated != null)'),
      );

      expect(
        source,
        contains('if (rawTrending != null)'),
      );

      expect(
        source,
        contains('if (rawRecommendations != null)'),
      );

      expect(
        source,
        contains('if (rawRecentlyViewed != null)'),
      );
    },
  );

  test(
    'Business Hub preserves rendered ads during transient reload failure',
    () {
      expect(
        source,
        contains('if (_ads.isEmpty) {'),
        reason:
            'A transient session or network failure must not replace already rendered ads with a full-screen error.',
      );

      expect(
        source,
        contains("'Failed to load advertisements.'"),
      );
    },
  );

  test('Top Rated only promotes listings with real reviews', () {
    expect(
      source,
      contains('final topRatedWithReviews = _topRatedAds.where'),
    );
    expect(source, contains('return ratingCount > 0;'));
  });

  test('unrated listings still communicate rating state elsewhere', () {
    expect(source, contains('ratingCount > 0'));
    expect(source, contains(": 'New'"));
  });

  test('buyer item detail exposes seller identity and reputation', () {
    expect(detailSource, contains("ad['seller_first_name']"));
    expect(detailSource, contains("ad['seller_last_name']"));
    expect(detailSource, contains("ad['company_name']"));
    expect(detailSource, contains("ad['seller_average_rating']"));
    expect(detailSource, contains("ad['seller_review_count']"));
    expect(detailSource, contains('View Seller Profile'));
    expect(detailSource, contains('Message Seller'));
  });

  test('owners keep ad status controls while buyers get item details', () {
    expect(detailSource, contains("ad['is_owner'] == true"));
    expect(detailSource, contains("'Ad Status' : 'Item Details'"));
    expect(detailSource, contains('if (isOwner)'));
    expect(detailSource, contains("if (!isOwner && status == 'active')"));
  });

  test('item photos open a full-screen swipe and zoom viewer', () {
    expect(detailSource, contains('class _FullScreenGallery'));
    expect(detailSource, contains('PageView.builder'));
    expect(detailSource, contains('InteractiveViewer'));
    expect(detailSource, contains('onDoubleTap: _toggleZoom'));
    expect(detailSource, contains('maxScale: 4'));
    expect(detailSource, contains("'View full photo'"));
  });
}
