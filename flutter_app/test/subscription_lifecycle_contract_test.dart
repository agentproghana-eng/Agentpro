import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected source file to exist: $path',
  );

  return file.readAsStringSync();
}

void main() {
  group('Subscription lifecycle contracts', () {
    test(
      'Business Subscription disposes its payment controllers',
      () {
        final source = _readSource(
          'lib/features/subscription/subscription_screen.dart',
        );

        expect(source, contains('void dispose()'));
        expect(source, contains('_refCtrl.dispose();'));
        expect(source, contains('_phoneCtrl.dispose();'));
      },
    );

    test(
      'paid Personal subscribers can submit renewal payments',
      () {
        final source = _readSource(
          'lib/features/subscription/'
          'personal_subscription_screen.dart',
        );

        expect(
          source,
          isNot(
            contains(
              'if (instructions != null && !isPaid)',
            ),
          ),
        );

        expect(
          source,
          contains("'Submit Manual Renewal'"),
        );

        expect(
          source,
          contains("'Submit Manual Payment'"),
        );
      },
    );

    test(
      'Personal status refresh synchronizes cached AuthBloc entitlement',
      () {
        final source = _readSource(
          'lib/features/subscription/'
          'personal_subscription_screen.dart',
        );

        expect(
          source,
          contains('AuthUpdateUserEvent'),
        );

        expect(
          source,
          contains("'personal_subscription_plan'"),
        );

        expect(
          source,
          contains("'personal_subscription_expires_at'"),
        );
      },
    );

    test(
      'Personal subscription notifications route to Personal Subscription',
      () {
        final source = _readSource(
          'lib/core/services/notification_service.dart',
        );

        expect(
          source,
          contains(
            "case 'personal_subscription_approved':",
          ),
        );

        expect(
          source,
          contains(
            "case 'personal_subscription_rejected':",
          ),
        );

        expect(
          source,
          contains("return '/personal-subscription';"),
        );
      },
    );
  });
}
