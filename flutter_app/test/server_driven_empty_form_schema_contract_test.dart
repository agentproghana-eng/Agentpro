import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../lib/features/ussd_settings/quick_action_catalog.dart';

void main() {
  test('explicit empty V2 form schema survives parse and cache', () {
    final catalog = QuickActionCatalog.fromCacheJson({
      'mode': 'business',
      'role': 'merchant',
      'schema_version': 2,
      'providers': [
        {
          'provider': 'telecel',
          'actions': [
            {
              'provider': 'telecel',
              'transaction_type': 'data_bundle',
              'display_label': 'Data Bundle',
              'quick_action_group': 'Services',
              'variants': [
                {
                  'bundle_category': null,
                  'recipient_mode': 'self',
                },
                {
                  'bundle_category': null,
                  'recipient_mode': 'other',
                },
              ],
              'form_fields': <Map<String, dynamic>>[],
            },
          ],
        },
      ],
    });

    final definition =
        catalog.definitionFor('telecel', 'data_bundle');

    expect(definition, isNotNull);
    expect(definition!.hasServerDrivenFormSchema, isTrue);
    expect(definition.formFields, isEmpty);

    final cached = catalog.toCacheJson();
    final providers = cached['providers'] as List<dynamic>;
    final provider =
        providers.single as Map<String, dynamic>;
    final actions = provider['actions'] as List<dynamic>;
    final action =
        actions.single as Map<String, dynamic>;

    expect(action.containsKey('form_fields'), isTrue);
    expect(action['form_fields'], isEmpty);
  });

  test('absent form_fields remains legacy/non-server-driven', () {
    final definition =
        QuickActionCatalogDefinition.fromJson({
      'provider': 'telecel',
      'transaction_type': 'data_bundle',
      'display_label': 'Data Bundle',
      'quick_action_group': 'Services',
      'variants': <Map<String, dynamic>>[],
    });

    expect(definition.hasServerDrivenFormSchema, isFalse);
    expect(definition.formFields, isEmpty);
    expect(
      definition.toCacheJson().containsKey('form_fields'),
      isFalse,
    );
  });

  test(
    'dashboard forwards explicit empty schema and transaction screen accepts it',
    () {
      final dashboard = File(
        'lib/features/dashboard/widgets/'
        'dashboard_quick_actions_section.dart',
      ).readAsStringSync();

      final transactionScreen = File(
        'lib/features/transactions/transaction_screen.dart',
      ).readAsStringSync();

      expect(
        dashboard,
        contains('definition.hasServerDrivenFormSchema'),
      );
      expect(
        dashboard,
        isNot(contains('definition.formFields.isNotEmpty')),
      );

      expect(
        transactionScreen,
        contains('!definition.hasServerDrivenFormSchema'),
      );
      expect(
        transactionScreen,
        isNot(contains('definition.formFields.isEmpty')),
      );
    },
  );

  test(
    'Telecel Merchant Data keeps provider-specific recipient UX',
    () {
      final source = File(
        'lib/features/transactions/transaction_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains("if (_isTelecelMerchantData) ...["),
      );
      expect(
        source,
        contains("value: 'self'"),
      );
      expect(
        source,
        contains("value: 'other'"),
      );
      expect(
        source,
        contains(
          "(!_isTelecelDataBundle || "
          "_isTelecelMerchantDataOther)",
        ),
      );
    },
  );
}
