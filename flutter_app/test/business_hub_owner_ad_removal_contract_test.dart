import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) =>
      File(path).readAsStringSync();

  test(
    'Business Hub owner can remove an active listing with confirmation',
    () {
      final adDetail = source(
        'lib/features/marketplace/ad_detail_screen.dart',
      );

      expect(
        adDetail,
        contains('Future<void> _removeAd()'),
      );

      expect(
        adDetail,
        contains("if (_removing || _ad?['status']?.toString() != 'active')"),
      );

      expect(
        adDetail,
        contains(
          "ApiClient.instance.delete(",
        ),
      );

      expect(
        adDetail,
        contains(
          "'/marketplace/\${widget.adId}'",
        ),
      );

      expect(
        adDetail,
        contains("'Remove this listing?'"),
      );

      expect(
        adDetail,
        contains("if (status == 'active') ...["),
      );

      expect(
        adDetail,
        contains("label: 'Remove Listing'"),
      );
    },
  );

  test(
    'removed listings remain represented in owner history',
    () {
      final adDetail = source(
        'lib/features/marketplace/ad_detail_screen.dart',
      );

      final myAds = source(
        'lib/features/marketplace/my_ads_screen.dart',
      );

      expect(
        adDetail,
        contains("'removed' => ("),
      );

      expect(
        adDetail,
        contains("'Removed'"),
      );

      expect(
        adDetail,
        contains(
          'payment and performance history',
        ),
      );

      expect(
        myAds,
        contains(
          'StatusBadge(status: status)',
        ),
      );
    },
  );
}
