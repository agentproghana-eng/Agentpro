import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final detail = File(
    'lib/features/marketplace/ad_detail_screen.dart',
  ).readAsStringSync();

  final storefront = File(
    'lib/features/marketplace/seller_storefront_screen.dart',
  ).readAsStringSync();

  test('Seller Storefront keeps the person name primary', () {
    expect(
      storefront,
      contains('String get _sellerName'),
    );

    expect(
      storefront,
      contains(
        'String get _companyName =>',
      ),
    );

    final displayNameStart = storefront.indexOf(
      'String get _displayName',
    );

    final displayNameEnd = storefront.indexOf(
      'String? get _imageUrl',
      displayNameStart,
    );

    expect(displayNameStart, greaterThanOrEqualTo(0));
    expect(displayNameEnd, greaterThan(displayNameStart));

    final displayName = storefront.substring(
      displayNameStart,
      displayNameEnd,
    );

    expect(
      displayName.indexOf('_sellerName.isNotEmpty'),
      lessThan(
        displayName.indexOf('_companyName.isNotEmpty'),
      ),
    );
  });

  test('Storefront shows an optional business name second', () {
    expect(
      storefront,
      contains(
        '_sellerName.isNotEmpty && _companyName.isNotEmpty',
      ),
    );

    expect(
      storefront,
      contains(
        'Text(\n'
        '                _companyName,',
      ),
    );
  });

  test('Seller Storefront prefers the person photo', () {
    final imageStart = storefront.indexOf(
      'String? get _imageUrl',
    );

    expect(imageStart, greaterThanOrEqualTo(0));

    final imageGetter = storefront.substring(imageStart);

    expect(
      imageGetter.indexOf('profile_image_url'),
      lessThan(
        imageGetter.indexOf('company_logo_url'),
      ),
    );
  });

  test('Ad Detail prefers the person photo', () {
    final sellerImageStart = detail.indexOf(
      'final sellerImageUrl =',
    );

    expect(sellerImageStart, greaterThanOrEqualTo(0));

    final sellerImageBlock = detail.substring(
      sellerImageStart,
      detail.indexOf(
        'final isVerified',
        sellerImageStart,
      ),
    );

    expect(
      sellerImageBlock.indexOf('sellerImage != null'),
      lessThan(
        sellerImageBlock.indexOf('companyLogo != null'),
      ),
    );
  });

  test('Ad Detail keeps person name before business name', () {
    final sellerBlockStart = detail.indexOf(
      'if (sellerName.isNotEmpty)',
    );

    expect(sellerBlockStart, greaterThanOrEqualTo(0));

    final sellerBlock = detail.substring(
      sellerBlockStart,
      detail.indexOf(
        'const SizedBox(height: 4)',
        sellerBlockStart,
      ),
    );

    expect(
      sellerBlock.indexOf('sellerName'),
      lessThan(
        sellerBlock.indexOf('companyName'),
      ),
    );
  });
}
