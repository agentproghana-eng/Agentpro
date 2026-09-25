import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final router = File(
    'lib/core/router/app_router.dart',
  ).readAsStringSync();

  group('Telecel Merchant Transfer E-Cash workspace', () {
    test('fallback exposes validated Merchant business actions', () {
      final start = dashboard.indexOf(
        'const telecelMerchantDefaults = <String>[',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = dashboard.indexOf('];', start);
      expect(end, greaterThan(start));

      final defaults = dashboard.substring(start, end);

      expect(defaults, contains("'airtime'"));
      expect(defaults, contains("'balance_enquiry'"));
      expect(defaults, contains("'float_to_working'"));

      expect(defaults, contains("'send_money'"));
      expect(defaults, contains("'send_money_to_bank'"));
    });

    test('uses canonical internal-transfer identities', () {
      expect(
        transaction,
        contains(
          "_telecelMerchantECashOperation = 'float_to_working'",
        ),
      );

      expect(
        transaction,
        contains("'working_to_float'"),
      );

      expect(
        transaction,
        isNot(contains("'transfer_ecash'")),
      );
    });

    test('shows both established directions', () {
      expect(
        transaction,
        contains('TRANSFER TO WORKING ACCOUNT'),
      );

      expect(
        transaction,
        contains('TRANSFER TO MERCHANT ACCOUNT'),
      );

      expect(
        transaction,
        contains("'float_to_working'"),
      );

      expect(
        transaction,
        contains("'working_to_float'"),
      );
    });

    test('uses a dedicated Telecel exact-SIM workspace route', () {
      expect(
        router,
        contains(
          "path: '/transactions/telecel-merchant-ecash'",
        ),
      );

      expect(
        router,
        contains("initialProvider: 'telecel'"),
      );

      expect(
        router,
        contains('initialSimSlot:'),
      );

      expect(
        router,
        contains('initialSimIccid: simIccid'),
      );

      expect(
        router,
        contains('initialSimSubscriptionId:'),
      );

      expect(
        router,
        contains('telecelMerchantECashWorkspace: true'),
      );
    });

    test('dashboard dedupes presentation without rewriting preferences', () {
      expect(
        dashboard,
        contains("'Transfer E-Cash'"),
      );

      expect(
        dashboard,
        contains('telecelMerchantECashAdded'),
      );

      expect(
        dashboard,
        contains(
          'Saved customization remains untouched; only presentation is deduped.',
        ),
      );

      expect(
        dashboard,
        contains(
          "'/transactions/telecel-merchant-ecash'",
        ),
      );
    });

    test('keyboard-safe transaction layout remains intact', () {
      expect(
        transaction,
        contains('resizeToAvoidBottomInset: true'),
      );

      expect(transaction, contains('body: Column('));
      expect(transaction, contains('SingleChildScrollView('));

      expect(
        transaction,
        isNot(contains('bottomNavigationBar:')),
      );
    });
  });
}
