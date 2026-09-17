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
      contains('maxWidth: _maxAdImageDimension'),
    );

    expect(
      source,
      contains('maxHeight: _maxAdImageDimension'),
    );

    expect(
      source,
      contains(
        '_selectedImages.length >= _maxAdPhotos',
      ),
    );

    expect(
      source,
      contains(
        '_selectedImages.length < _maxAdPhotos',
      ),
    );

    expect(
      source,
      contains('Photos (1–8 required)'),
    );
  });
}
