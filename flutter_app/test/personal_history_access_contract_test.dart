import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(file.existsSync(), isTrue);

  return file.readAsStringSync();
}

void main() {
  group('Personal History access contracts', () {
    test(
      'History uses the Paid-only backend endpoint',
      () {
        final source = _readSource(
          'lib/features/transactions/'
          'personal_transaction_history_screen.dart',
        );

        expect(
          source,
          contains("'/personal-transactions/history'"),
        );

        expect(
          source,
          isNot(
            contains(
              'ApiClient.instance.get(\n'
              "        '/personal-transactions',",
            ),
          ),
        );
      },
    );

    test(
      'Paid Personal access checks subscription expiry',
      () {
        final helper = _readSource(
          'lib/core/auth/personal_subscription_access.dart',
        );

        final history = _readSource(
          'lib/features/transactions/'
          'personal_transaction_history_screen.dart',
        );

        final more = _readSource(
          'lib/features/dashboard/personal_more_tab.dart',
        );

        expect(
          helper,
          contains("'personal_subscription_plan'"),
        );

        expect(
          helper,
          contains("'personal_subscription_expires_at'"),
        );

        expect(
          helper,
          contains('DateTime.tryParse'),
        );

        expect(
          helper,
          contains('expiresAt.isBefore'),
        );

        expect(
          history,
          contains(
            'hasActivePaidPersonalPlan(state.user)',
          ),
        );

        expect(
          more,
          contains(
            'hasActivePaidPersonalPlan(user)',
          ),
        );
      },
    );
  });
}
