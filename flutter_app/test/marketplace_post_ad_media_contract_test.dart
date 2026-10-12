import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Marketplace Post Ad keeps the 8-photo optimized upload contract', () {
    final source = File(
      'lib/features/marketplace/post_ad_screen.dart',
    ).readAsStringSync();

    expect(
      source,
      contains('static const int _maxAdPhotos = 8;'),
    );

    expect(
      source,
      contains(
        'static const double _maxAdImageDimension = 2000;',
      ),
    );

    expect(
      source,
      contains('imageQuality: 80'),
    );

    expect(
      source,
      contains('sendTimeout: const Duration(seconds: 120)'),
    );

    expect(
      source,
      contains('receiveTimeout: const Duration(seconds: 60)'),
    );

    expect(
      source,
      contains('maxWidth: _maxAdImageDimension'),
    );

    expect(
      source,
      contains('maxHeight: _maxAdImageDimension'),
    );

    expect(
      source,
      contains(
        '_photoCount >= _maxAdPhotos',
      ),
    );

    expect(
      source,
      contains(
        '_photoCount < _maxAdPhotos',
      ),
    );

    expect(
      source,
      contains('Photos (1–8 required)'),
    );

    // Posting again keeps photos from the seller's own earlier ad, and the
    // 8-photo limit counts kept and newly chosen photos together.
    expect(
      source,
      contains(
        'int get _photoCount => _selectedImages.length + _keptImageUrls.length;',
      ),
    );

    expect(source, contains("'repost_from_ad_id': widget.repostFromAdId"));
    expect(source, contains("'kept_image_urls': jsonEncode(_keptImageUrls)"));
  });
}
