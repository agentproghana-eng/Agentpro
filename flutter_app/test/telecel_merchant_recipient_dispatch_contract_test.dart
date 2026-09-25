import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Telecel Merchant outgoing phone transactions route recipient phone',
    () {
      final source = File(
        'lib/features/transactions/transaction_progress_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains("'send_money_same_network',"),
      );
      expect(
        source,
        contains("'send_money_cross_network',"),
      );
      expect(
        source,
        contains(
          "? automationParams['recipient_phone']",
        ),
      );
    },
  );

  test(
    'invalid customer phone is a definite pre-dispatch failure',
    () {
      final source = File(
        'lib/core/services/ussd_service.dart',
      ).readAsStringSync();

      expect(
        source,
        contains("'INVALID_CUSTOMER_PHONE',"),
      );
      expect(
        source,
        contains(
          "'MISSING_CUSTOMER_PHONE' ||\n"
          "          'INVALID_CUSTOMER_PHONE' =>",
        ),
      );
    },
  );
}
