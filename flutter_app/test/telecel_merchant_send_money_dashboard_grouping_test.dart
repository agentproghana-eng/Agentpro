import 'package:flutter_test/flutter_test.dart';
import 'package:agentpro/features/ussd_settings/quick_action_preference.dart';

void main() {
  group('Telecel Merchant Send Money dashboard grouping', () {
    test('legacy same and cross network actions become one Send Money action', () {
      const preferences = <QuickActionPreference>[
        QuickActionPreference(
          actionKey: 'airtime',
          position: 0,
        ),
        QuickActionPreference(
          actionKey: 'send_money_same_network',
          position: 1,
        ),
        QuickActionPreference(
          actionKey: 'send_money_cross_network',
          position: 2,
        ),
        QuickActionPreference(
          actionKey: 'send_money_to_bank',
          position: 3,
        ),
      ];

      final normalized = normalizeTelecelMerchantQuickActionPreferences(
        preferences: preferences,
      );

      expect(
        normalized.where((item) => item.actionKey == 'send_money'),
        hasLength(1),
      );

      expect(
        normalized.any(
          (item) => item.actionKey == 'send_money_same_network',
        ),
        isFalse,
      );

      expect(
        normalized.any(
          (item) => item.actionKey == 'send_money_cross_network',
        ),
        isFalse,
      );

      expect(
        normalized.any(
          (item) => item.actionKey == 'send_money_to_bank',
        ),
        isTrue,
      );

      expect(
        normalized.firstWhere(
          (item) => item.actionKey == 'send_money',
        ).position,
        1,
      );
    });

    test('single legacy capability still enters grouped Send Money workspace', () {
      const preferences = <QuickActionPreference>[
        QuickActionPreference(
          actionKey: 'send_money_same_network',
          position: 4,
        ),
      ];

      final normalized = normalizeTelecelMerchantQuickActionPreferences(
        preferences: preferences,
      );

      expect(normalized, hasLength(1));
      expect(normalized.single.actionKey, 'send_money');
      expect(normalized.single.position, 4);
    });

    test('canonical Send Money is not duplicated by legacy identities', () {
      const preferences = <QuickActionPreference>[
        QuickActionPreference(
          actionKey: 'send_money_same_network',
          position: 1,
        ),
        QuickActionPreference(
          actionKey: 'send_money',
          position: 2,
        ),
        QuickActionPreference(
          actionKey: 'send_money_cross_network',
          position: 3,
        ),
      ];

      final normalized = normalizeTelecelMerchantQuickActionPreferences(
        preferences: preferences,
      );

      expect(normalized, hasLength(1));
      expect(normalized.single.actionKey, 'send_money');
      expect(normalized.single.position, 1);
    });

    test('unrelated Merchant actions remain unchanged', () {
      const preferences = <QuickActionPreference>[
        QuickActionPreference(
          actionKey: 'airtime',
          position: 0,
        ),
        QuickActionPreference(
          actionKey: 'data_bundle',
          position: 1,
        ),
        QuickActionPreference(
          actionKey: 'send_money_to_bank',
          position: 2,
        ),
        QuickActionPreference(
          actionKey: 'float_to_working',
          position: 3,
        ),
      ];

      final normalized = normalizeTelecelMerchantQuickActionPreferences(
        preferences: preferences,
      );

      expect(
        normalized.map((item) => item.actionKey).toList(),
        <String>[
          'airtime',
          'data_bundle',
          'send_money_to_bank',
          'float_to_working',
        ],
      );
    });
  });
}
