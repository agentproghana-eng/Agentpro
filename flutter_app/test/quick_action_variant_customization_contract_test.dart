import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Quick Action variant customization', () {
    final preference = File(
      'lib/features/ussd_settings/'
      'quick_action_preference.dart',
    ).readAsStringSync();

    final customization = File(
      'lib/features/ussd_settings/'
      'quick_action_customization_screen.dart',
    ).readAsStringSync();

    test('variant identity survives preference persistence', () {
      expect(
        preference,
        contains(
          'bundleCategory: '
          "_nullableString(map['bundle_category'])",
        ),
      );

      expect(
        preference,
        contains(
          'recipientMode: '
          "_nullableString(map['recipient_mode'])",
        ),
      );

      expect(
        preference,
        contains("'bundle_category': bundleCategory"),
      );

      expect(
        preference,
        contains("'recipient_mode': recipientMode"),
      );

      expect(
        preference,
        contains('String get identityKey'),
      );
    });

    test('customizer expands validated catalog variants', () {
      expect(
        customization,
        contains('class _QuickActionChoice'),
      );

      expect(
        customization,
        contains('definition.variants'),
      );

      expect(
        customization,
        contains('List<_QuickActionChoice> get _availableChoices'),
      );

      expect(
        customization,
        contains(
          'item.identityKey == choice.identityKey',
        ),
      );

      expect(
        customization,
        contains('_toggleChoice(choice)'),
      );
    });

    test('customizer keeps the 3x3 limit', () {
      expect(
        customization,
        contains(
          'A 3×3 grid can contain at most 9 actions.',
        ),
      );
    });

    test('variant labels are user-readable', () {
      expect(
        preference,
        contains("'Myself'"),
      );

      expect(
        preference,
        contains("'Someone Else'"),
      );

      expect(
        preference,
        contains("'Flexi · MoMo'"),
      );

      expect(
        preference,
        contains("'GHS \$amount · \$payment'"),
      );
    });
  });
}
