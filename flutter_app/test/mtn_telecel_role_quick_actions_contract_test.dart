import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final dashboard = File(
    'lib/features/dashboard/widgets/'
    'dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final customizer = File(
    'lib/features/ussd_settings/'
    'quick_action_customization_screen.dart',
  ).readAsStringSync();

  test(
    'MTN Agent keeps combined workspace and selected individual actions',
    () {
      expect(
        dashboard,
        contains(
          "provider == 'mtn' && role == 'agent' && type == 'send_money'",
        ),
      );

      expect(
        dashboard,
        contains("'Cash In/Out'"),
      );

      expect(
        dashboard,
        contains("'/transactions/mtn-cash-in-out'"),
      );

      expect(
        dashboard,
        isNot(
          contains(
            "if (provider == 'mtn' && role == 'agent' && type == 'cash_out')",
          ),
        ),
      );
    },
  );

  test(
    'Quick Action customization keeps role profiles independent',
    () {
      expect(
        customizer,
        contains("'merchant' => 'merchant_quick_actions'"),
      );

      expect(
        customizer,
        contains("'evd' => 'evd_quick_actions'"),
      );

      expect(
        customizer,
        contains("'agent'"),
      );
    },
  );

  test(
    'Telecel Merchant is not routed through Personal Send Money implicitly',
    () {
      expect(
        dashboard,
        contains("'merchant' => merchantQuickActions"),
      );

      expect(
        dashboard,
        contains("'subscriber'"),
      );

      expect(
        dashboard,
        contains("role == 'subscriber'"),
      );

      expect(
        dashboard,
        contains("'/personal-transactions/new'"),
      );

      expect(
        dashboard,
        contains("'/transactions'"),
      );
    },
  );

  test(
    'MTN business catalog does not collapse supported actions',
    () {
      final catalog = File(
        'lib/features/ussd_settings/quick_action_catalog.dart',
      ).readAsStringSync();

      expect(
        catalog,
        contains(
          'return List<QuickActionCatalogDefinition>.from(definitions);',
        ),
      );

      expect(
        catalog,
        isNot(contains('legacyCashInIndex')),
      );

      expect(
        catalog,
        isNot(contains('canonicalCashInIndex')),
      );
    },
  );

}

