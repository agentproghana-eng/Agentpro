import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/features/marketplace/marketplace_data_utils.dart';

void main() {
  final detail = File(
    'lib/features/marketplace/ad_detail_screen.dart',
  ).readAsStringSync();

  final marketplace = File(
    'lib/features/marketplace/marketplace_screen.dart',
  ).readAsStringSync();

  final saved = File(
    'lib/features/marketplace/saved_ads_screen.dart',
  ).readAsStringSync();

  final storefront = File(
    'lib/features/marketplace/seller_storefront_screen.dart',
  ).readAsStringSync();

  test('image normalization keeps only trimmed string URLs', () {
    expect(
      normalizedMarketplaceImageUrls([
        null,
        '',
        '   ',
        42,
        {'url': 'https://invalid.example'},
        ' https://example.com/one.jpg ',
        'https://example.com/two.jpg',
      ]),
      [
        'https://example.com/one.jpg',
        'https://example.com/two.jpg',
      ],
    );
  });

  test('image normalization safely handles non-list values', () {
    expect(normalizedMarketplaceImageUrls(null), isEmpty);
    expect(normalizedMarketplaceImageUrls('not-a-list'), isEmpty);
    expect(normalizedMarketplaceImageUrls({'image': 'url'}), isEmpty);
  });

  test('marketplace date parsing rejects blank and malformed values', () {
    expect(parseMarketplaceDateTime(null), isNull);
    expect(parseMarketplaceDateTime(''), isNull);
    expect(parseMarketplaceDateTime('   '), isNull);
    expect(parseMarketplaceDateTime('not-a-date'), isNull);
  });

  test('marketplace date parsing accepts trimmed ISO timestamps', () {
    final parsed = parseMarketplaceDateTime(
      ' 2026-08-15T05:00:00Z ',
    );

    expect(parsed, isNotNull);
    expect(parsed!.isUtc, isTrue);
    expect(parsed.year, 2026);
    expect(parsed.month, 8);
    expect(parsed.day, 15);
  });

  test('Ad Detail normalizes one image list for all gallery paths', () {
    expect(
      detail,
      contains(
        'final images = normalizedMarketplaceImageUrls(\n'
        "      ad['image_urls'],",
      ),
    );

    expect(
      detail,
      contains('void _openGallery(\n    List<String> images,'),
    );

    expect(
      detail,
      contains('images: images,'),
    );

    expect(
      detail,
      isNot(
        contains(
          '.map((image) => image.toString())',
        ),
      ),
    );
  });

  test('all Business Hub ad cards normalize image URLs', () {
    for (final source in [
      marketplace,
      saved,
      storefront,
    ]) {
      expect(
        source,
        contains('normalizedMarketplaceImageUrls('),
      );

      expect(
        source,
        contains('url: images.first'),
      );

      expect(
        source,
        isNot(
          contains('images.first.toString()'),
        ),
      );
    }
  });

  test('Ad Detail renders malformed dates without DateTime.parse', () {
    expect(
      detail,
      contains(
        'final publishedAt = parseMarketplaceDateTime(\n'
        "      ad['published_at'],",
      ),
    );

    expect(
      detail,
      contains(
        'final expiresAtDate = parseMarketplaceDateTime(expiresAt);',
      ),
    );

    expect(
      detail,
      isNot(contains('DateTime.parse(')),
    );
  });
}
