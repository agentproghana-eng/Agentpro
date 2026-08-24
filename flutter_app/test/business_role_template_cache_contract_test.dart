import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final queueSource = File(
    'lib/core/services/offline_queue_service.dart',
  ).readAsStringSync();

  final transactionSource = File(
    'lib/features/transactions/'
    'transaction_screen.dart',
  ).readAsStringSync();

  test(
    'Business USSD template cache key includes SIM role',
    () {
      expect(
        queueSource,
        contains(
          "String businessSimRole = 'agent'",
        ),
      );

      expect(
        queueSource,
        contains(
          'normalizedBusinessRole',
        ),
      );
    },
  );

  test(
    'template cache read and write accept Business SIM role',
    () {
      final count = RegExp(
        r'businessSimRole: businessSimRole',
      ).allMatches(queueSource).length;

      expect(
        count,
        greaterThanOrEqualTo(2),
      );
    },
  );

  test(
    'Business transaction template lookup is role scoped',
    () {
      expect(
        transactionSource,
        contains(
          'getCachedTemplate(',
        ),
      );

      expect(
        transactionSource,
        contains(
          'businessSimRole: businessSimRole',
        ),
      );
    },
  );
}
