import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('Business Hub uses Paystack as primary payment route', () {
    final adDetail = source(
      'lib/features/marketplace/ad_detail_screen.dart',
    );

    expect(
      adDetail,
      contains('Pay with Paystack'),
    );

    expect(
      adDetail,
      contains('/payment/paystack/initialize'),
    );

    expect(
      adDetail,
      contains('/payment/paystack/verify/'),
    );

    expect(
      adDetail,
      contains('Pay Manually Instead'),
    );
  });

  test('manual payment uses Transaction ID wording', () {
    final adDetail = source(
      'lib/features/marketplace/ad_detail_screen.dart',
    );

    final businessSubscription = source(
      'lib/features/subscription/subscription_screen.dart',
    );

    final personalSubscription = source(
      'lib/features/subscription/personal_subscription_screen.dart',
    );

    expect(
      adDetail,
      contains("labelText: 'Transaction ID'"),
    );

    expect(
      adDetail,
      contains("'transaction_id'"),
    );

    expect(
      businessSubscription,
      contains("labelText: 'Transaction ID'"),
    );

    expect(
      personalSubscription,
      contains("labelText: 'Transaction ID'"),
    );
  });
}
