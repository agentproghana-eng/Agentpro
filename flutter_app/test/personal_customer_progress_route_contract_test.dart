import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final router = File(
    'lib/core/router/app_router.dart',
  ).readAsStringSync();

  final personalTransaction = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  test(
    'Personal customer progress route is outside Business transactions prefix',
    () {
      expect(
        personalTransaction,
        contains("'/personal-transactions/progress'"),
      );

      expect(
        personalTransaction,
        isNot(
          contains(
            "context.push<String>(\n        '/transactions/progress'",
          ),
        ),
      );

      expect(
        router,
        contains("path: '/personal-transactions/progress'"),
      );

      expect(
        router,
        contains('isPersonal: true'),
      );
    },
  );

  test(
    'Business progress route remains available and business-only prefix unchanged',
    () {
      expect(
        router,
        contains("path: '/transactions/progress'"),
      );

      expect(
        router,
        contains("'/transactions'"),
      );

      expect(
        router,
        contains('momoOnlyPrefixes'),
      );
    },
  );
}
