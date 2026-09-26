import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String dashboard;
  late String transactionScreen;

  setUpAll(() {
    dashboard = File(
      'lib/features/dashboard/widgets/'
      'dashboard_quick_actions_section.dart',
    ).readAsStringSync();

    transactionScreen = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();
  });

  test(
    'old Telecel Merchant saved profiles gain Data without rewriting them',
    () {
      expect(
        dashboard,
        contains(
          "role == 'merchant' &&\n"
          "                provider == 'telecel' &&\n"
          "                !ordered.any((item) => "
          "item.actionKey == 'data_bundle')",
        ),
      );

      expect(
        dashboard,
        contains(
          "QuickActionPreference(\n"
          "                  actionKey: 'data_bundle',\n"
          "                  position: ordered.length,",
        ),
      );

      // Existing entries remain the source of truth and are copied as-is.
      expect(
        dashboard,
        contains('...ordered,'),
      );

      // A saved Data entry, including an intentionally hidden one, prevents
      // insertion of another visible Data action.
      expect(
        dashboard,
        contains(
          "!ordered.any((item) => item.actionKey == 'data_bundle')",
        ),
      );
    },
  );

  test(
    'Telecel Merchant Airtime defaults unresolved recipient variant to Other',
    () {
      expect(
        transactionScreen,
        contains(
          "_selectedProvider == 'telecel' &&\n"
          "        _transactionType == 'airtime'",
        ),
      );

      expect(
        transactionScreen,
        contains(
          "_initialRecipientMode?.toLowerCase() == 'self'\n"
          "          ? 'self'\n"
          "          : 'other'",
        ),
      );
    },
  );

  test(
    'effective recipient mode reaches preload cache and progress resolver',
    () {
      expect(
        transactionScreen,
        contains(
          'final recipientMode = _effectiveRecipientMode;',
        ),
      );

      expect(
        transactionScreen,
        contains(
          "if (recipientMode != null) "
          "'recipient_mode': recipientMode",
        ),
      );

      expect(
        RegExp(
          r"if \(_effectiveRecipientMode != null\)\s+"
          r"'recipient_mode': _effectiveRecipientMode",
        ).allMatches(transactionScreen).length,
        greaterThanOrEqualTo(2),
      );
    },
  );
}
