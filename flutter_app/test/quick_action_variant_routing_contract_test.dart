import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Quick Action variant routing', () {
    final dashboard = File(
      'lib/features/dashboard/widgets/'
      'dashboard_quick_actions_section.dart',
    ).readAsStringSync();

    final router = File(
      'lib/core/router/app_router.dart',
    ).readAsStringSync();

    final business = File(
      'lib/features/transactions/'
      'transaction_screen.dart',
    ).readAsStringSync();

    final personal = File(
      'lib/features/transactions/'
      'personal_transaction_screen.dart',
    ).readAsStringSync();

    test('Home and router preserve saved variant identity', () {
      expect(
        dashboard,
        contains(
          'preference.bundleCategory',
        ),
      );

      expect(
        dashboard,
        contains(
          "'bundle_category': bundleCategory",
        ),
      );

      expect(
        dashboard,
        contains(
          'preference.recipientMode',
        ),
      );

      expect(
        dashboard,
        contains(
          "'recipient_mode': recipientMode",
        ),
      );

      expect(
        router,
        contains(
          'initialBundleCategory: bundleCategory',
        ),
      );

      expect(
        router,
        contains(
          'initialRecipientMode: recipientMode',
        ),
      );
    });

    test('Business exact flow is variant-scoped', () {
      expect(
        business,
        contains(
          'final String? initialBundleCategory;',
        ),
      );

      expect(
        business,
        contains(
          'final String? initialRecipientMode;',
        ),
      );

      expect(
        business,
        contains(
          'bundleCategory: _initialBundleCategory',
        ),
      );

      expect(
        business,
        contains(
          'recipientMode: _initialRecipientMode',
        ),
      );

      expect(
        business,
        contains(
          "'bundle_category': bundleCategory",
        ),
      );

      expect(
        business,
        contains(
          "'recipient_mode': recipientMode",
        ),
      );
    });

    test('Personal screen consumes saved variant preset', () {
      expect(
        personal,
        contains(
          'final String? initialBundleCategory;',
        ),
      );

      expect(
        personal,
        contains(
          'final String? initialRecipientMode;',
        ),
      );

      expect(
        personal,
        contains(
          '_applyInitialQuickActionPreset',
        ),
      );

      expect(
        personal,
        contains(
          "bundle.startsWith('flexi_')",
        ),
      );

      expect(
        personal,
        contains("'fixed_page1_'"),
      );

      expect(
        personal,
        contains("'fixed_page2_'"),
      );

      expect(
        personal,
        contains(
          "r'^(ghc1|ghc5|ghc10|ghc30)'",
        ),
      );
    });

    test('preset remains user-overridable', () {
      expect(
        personal,
        contains('keepPresetPayment'),
      );

      expect(
        personal,
        contains('_flexiPayment = null'),
      );

      expect(
        personal,
        contains("'mtn_payment'"),
      );
    });
  });
}
