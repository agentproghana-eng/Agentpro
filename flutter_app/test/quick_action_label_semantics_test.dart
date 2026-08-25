import 'package:agent_pro_ghana/features/ussd_settings/quick_action_catalog.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_preference.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Quick Action business terminology', () {
    test('MTN send_money is displayed as Cash In', () {
      final definition = QuickActionCatalogDefinition.fromJson(
        const {
          'provider': 'mtn',
          'transaction_type': 'send_money',
          'display_label': 'Send Money',
          'quick_action_group': 'Transfers & Payments',
        },
      );

      expect(definition.displayLabel, 'Cash In');
    });

    test('pay_to_agent is displayed as Pay to Agent', () {
      final definition = QuickActionCatalogDefinition.fromJson(
        const {
          'provider': 'mtn',
          'transaction_type': 'pay_to_agent',
          'display_label': 'Bill Payment',
          'quick_action_group': 'Transfers & Payments',
        },
      );

      expect(definition.displayLabel, 'Pay to Agent');
    });

    test(
        'catalog-specific labels remain intact when no semantic override exists',
        () {
      final definition = QuickActionCatalogDefinition.fromJson(
        const {
          'provider': 'mtn',
          'transaction_type': 'send_money_same_network',
          'display_label': 'Send Money (Same Network)',
          'quick_action_group': 'Transfers & Payments',
        },
      );

      expect(definition.displayLabel, 'Send Money (Same Network)');
    });
  });

  group('MTN Cash In canonical position', () {
    test('catalog moves send_money into the former cash_in position', () {
      const definitions = [
        QuickActionCatalogDefinition(
          provider: 'mtn',
          type: 'cash_in',
          displayLabel: 'Cash In',
          quickActionGroup: 'Cash & Float',
        ),
        QuickActionCatalogDefinition(
          provider: 'mtn',
          type: 'airtime',
          displayLabel: 'Airtime',
          quickActionGroup: 'Airtime & Data',
        ),
        QuickActionCatalogDefinition(
          provider: 'mtn',
          type: 'send_money',
          displayLabel: 'Cash In',
          quickActionGroup: 'Transfers & Payments',
        ),
      ];

      final normalized = normalizeBusinessQuickActionDefinitions(
        provider: 'mtn',
        definitions: definitions,
      );

      expect(
        normalized.map((item) => item.type).toList(),
        [
          'send_money',
          'airtime',
        ],
      );
    });

    test('saved MTN layout keeps the old cash_in slot for send_money', () {
      const saved = [
        QuickActionPreference(
          actionKey: 'cash_in',
          position: 0,
          iconKey: 'deposit',
        ),
        QuickActionPreference(
          actionKey: 'airtime',
          position: 1,
        ),
        QuickActionPreference(
          actionKey: 'send_money',
          position: 2,
        ),
      ];

      final normalized = normalizeBusinessQuickActionPreferences(
        provider: 'mtn',
        preferences: saved,
      );

      expect(
        normalized.map((item) => item.actionKey).toList(),
        [
          'send_money',
          'airtime',
        ],
      );

      expect(normalized[0].position, 0);
      expect(normalized[0].iconKey, 'deposit');
    });
  });
}
