import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _source(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected source file to exist: $path',
  );

  return file.readAsStringSync();
}

void main() {
  group('Hybrid subscription payment UI contracts', () {
    test(
      'shared service uses backend Paystack endpoints and hosted checkout',
      () {
        final source = _source(
          'lib/features/subscription/'
          'subscription_payment_service.dart',
        );

        expect(source, contains("'/subscriptions'"));

        expect(source, contains("'/personal-subscription'"));

        expect(source, contains('/paystack/initialize'));

        expect(source, contains('/paystack/verify/'));

        expect(source, contains("data['authorization_url']"));

        expect(source, contains('LaunchMode.externalApplication'));

        expect(source, contains('SharedPreferences'));

        expect(source, isNot(contains('PAYSTACK_SECRET_KEY')));
      },
    );

    test(
      'Business subscription exposes instant Paystack and manual verification paths',
      () {
        final source = _source(
          'lib/features/subscription/'
          'subscription_screen.dart',
        );

        expect(source, contains('Pay with Paystack — Instant Activation'));

        expect(source, contains('Pay Manually — Requires Verification'));

        expect(source, contains('WidgetsBindingObserver'));

        expect(source, contains('AppLifecycleState.resumed'));

        expect(source, contains('_automaticVerificationPending'));

        expect(source, contains('_runAutomaticPaystackVerification'));

        expect(source, contains('addPostFrameCallback'));

        expect(source, contains('Duration(seconds: 2)'));

        expect(source, contains('_verifyPaystack'));

        expect(source, contains('Check payment status'));
      },
    );

    test(
      'Personal subscription exposes the same hybrid payment paths and keeps auth refresh',
      () {
        final source = _source(
          'lib/features/subscription/'
          'personal_subscription_screen.dart',
        );

        expect(source, contains('Pay with Paystack — Instant Activation'));

        expect(source, contains('Pay Manually — Requires Verification'));

        expect(source, contains('WidgetsBindingObserver'));

        expect(source, contains('AppLifecycleState.resumed'));

        expect(source, contains('_automaticVerificationPending'));

        expect(source, contains('_runAutomaticPaystackVerification'));

        expect(source, contains('addPostFrameCallback'));

        expect(source, contains('Duration(seconds: 2)'));

        expect(source, contains('AuthUpdateUserEvent'));

        expect(source, contains('Check payment status'));
      },
    );

    test('captured stale payments are a terminal reconciliation state', () {
      for (final path in [
        'lib/features/subscription/'
            'subscription_screen.dart',
        'lib/features/subscription/'
            'personal_subscription_screen.dart',
      ]) {
        final source = _source(path);

        expect(source, contains("result.outcome == 'reconciliation_required'"));

        expect(source, contains('No extra subscription period was added.'));

        expect(source, contains('clearPendingReference'));
      }
    });

    test('no Flutter subscription file contains a Paystack server secret', () {
      for (final path in [
        'lib/features/subscription/'
            'subscription_payment_service.dart',
        'lib/features/subscription/'
            'subscription_screen.dart',
        'lib/features/subscription/'
            'personal_subscription_screen.dart',
      ]) {
        expect(_source(path), isNot(contains('PAYSTACK_SECRET_KEY')));
      }
    });
  });
}
