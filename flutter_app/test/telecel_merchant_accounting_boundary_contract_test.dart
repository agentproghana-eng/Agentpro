import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final customization = File(
    'lib/features/ussd_settings/quick_action_customization_screen.dart',
  ).readAsStringSync();

  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  group('Telecel Merchant accounting presentation boundary', () {
    test('customization exposes only currently enabled Merchant actions', () {
      expect(
        customization,
        contains('_isEnabledTelecelMerchantAction'),
      );

      expect(customization, contains("'airtime'"));
      expect(customization, contains("'balance_enquiry'"));
      expect(customization, contains("'float_to_working'"));
      expect(customization, contains("'working_to_float'"));

      expect(
        customization,
        contains(
          '_isEnabledTelecelMerchantAction(definition.type)',
        ),
      );
    });

    test('saved Merchant preferences are filtered only for presentation', () {
      expect(
        dashboard,
        contains('final presentationOrdered ='),
      );

      expect(
        dashboard,
        contains(
          "role == 'merchant' && provider == 'telecel'",
        ),
      );

      expect(dashboard, contains("'airtime'"));
      expect(dashboard, contains("'balance_enquiry'"));
      expect(dashboard, contains("'float_to_working'"));
      expect(dashboard, contains("'working_to_float'"));

      expect(
        dashboard,
        contains('Keep saved preferences intact'),
      );
    });

    test('outgoing Merchant implementation remains available underneath', () {
      expect(
        transaction,
        contains("'send_money_same_network'"),
      );
      expect(
        transaction,
        contains("'send_money_cross_network'"),
      );
      expect(
        transaction,
        contains("'send_money_to_bank'"),
      );
    });

    test('Merchant fallback remains restricted', () {
      final start = dashboard.indexOf(
        'const telecelMerchantDefaults',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = dashboard.indexOf('];', start);
      expect(end, greaterThan(start));

      final defaults = dashboard.substring(start, end + 2);

      expect(defaults, contains("'airtime'"));
      expect(defaults, contains("'balance_enquiry'"));
      expect(defaults, contains("'float_to_working'"));
      expect(defaults, isNot(contains("'send_money'")));
      expect(
        defaults,
        isNot(contains("'send_money_to_bank'")),
      );
    });
  });
}
