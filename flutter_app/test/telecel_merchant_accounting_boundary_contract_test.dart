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

  group('Telecel Merchant validated action presentation', () {
    test('temporary Merchant accounting presentation gate is removed', () {
      expect(
        customization,
        isNot(contains('_isEnabledTelecelMerchantAction')),
      );

      expect(
        dashboard,
        isNot(contains(
          'until Merchant accounting is enabled',
        )),
      );
    });

    test('Merchant fallback exposes the five business workspaces', () {
      final start = dashboard.indexOf(
        'const telecelMerchantDefaults',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = dashboard.indexOf('];', start);
      expect(end, greaterThan(start));

      final defaults = dashboard.substring(start, end + 2);

      expect(defaults, contains("'airtime'"));
      expect(defaults, contains("'balance_enquiry'"));
      expect(defaults, contains("'send_money'"));
      expect(defaults, contains("'float_to_working'"));
      expect(defaults, contains("'send_money_to_bank'"));

      final entries =
          RegExp(r"'[^']+'").allMatches(defaults).toList();
      expect(entries, hasLength(5));
    });

    test('Send Money remains a grouped Merchant workspace', () {
      expect(
        dashboard,
        contains("type == 'send_money'"),
      );
      expect(
        dashboard,
        contains("'Send Money'"),
      );

      expect(
        transaction,
        contains("'send_money_same_network'"),
      );
      expect(
        transaction,
        contains("'send_money_cross_network'"),
      );
    });

    test('Transfer E-Cash remains one grouped Merchant workspace', () {
      expect(
        dashboard,
        contains(
          "type == 'float_to_working' || "
          "type == 'working_to_float'",
        ),
      );
      expect(
        dashboard,
        contains("'Transfer E-Cash'"),
      );
      expect(
        dashboard,
        contains(
          "'/transactions/telecel-merchant-ecash'",
        ),
      );
    });

    test('Bank Transfer remains a standalone Merchant action', () {
      expect(
        dashboard,
        contains("type == 'send_money_to_bank'"),
      );
      expect(
        dashboard,
        contains("'Bank Transfer'"),
      );
      expect(
        transaction,
        contains("'send_money_to_bank'"),
      );
    });

    test('saved Merchant preferences are not rewritten for exposure', () {
      expect(
        dashboard,
        contains('final presentationOrdered = ordered;'),
      );
    });
  });
}
