import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_catalog.dart';

void main() {

  test('new client advertises V2 catalog capability', () {
    expect(QuickActionCatalog.supportedSchemaVersion, 2);
  });

  test('V2 parses and caches generic transaction form fields', () {
    final catalog = QuickActionCatalog.fromCacheJson({
      'mode': 'business',
      'role': 'evd',
      'schema_version': 2,
      'providers': [
        {
          'provider': 'mtn',
          'actions': [
            {
              'provider': 'mtn',
              'transaction_type': 'airtime',
              'display_label': 'Sell Airtime',
              'quick_action_group': 'Airtime & Data',
              'variants': [],
              'form_fields': [
                {
                  'key': 'customer_phone',
                  'type': 'phone',
                  'label': 'Customer Number',
                  'required': true,
                  'min_length': 10,
                  'max_length': 10,
                },
                {
                  'key': 'amount',
                  'type': 'amount',
                  'label': 'Amount',
                  'required': true,
                },
              ],
            },
          ],
        },
      ],
    });

    final action = catalog.definitionFor('mtn', 'airtime');

    expect(catalog.schemaVersion, 2);
    expect(catalog.role, 'evd');
    expect(action, isNotNull);
    expect(action!.formFields, hasLength(2));
    expect(action.formFields.first.type, 'phone');
    expect(action.formFields.first.minLength, 10);
    expect(action.formFields.last.type, 'amount');

    final cached = catalog.toCacheJson();
    final restored = QuickActionCatalog.fromCacheJson(cached);

    expect(
      restored.definitionFor('mtn', 'airtime')!.formFields,
      hasLength(2),
    );
  });

  test('V1 remains readable with no dynamic form fields', () {
    final catalog = QuickActionCatalog.fromCacheJson({
      'mode': 'business',
      'role': 'agent',
      'schema_version': 1,
      'providers': [
        {
          'provider': 'mtn',
          'actions': [
            {
              'provider': 'mtn',
              'transaction_type': 'airtime',
              'display_label': 'Airtime',
              'quick_action_group': 'Airtime & Data',
              'variants': [],
            },
          ],
        },
      ],
    });

    expect(catalog.schemaVersion, 1);
    expect(
      catalog.definitionFor('mtn', 'airtime')!.formFields,
      isEmpty,
    );
  });

  test('unknown field primitives fail closed', () {
    expect(
      () => TransactionFormFieldDefinition.fromJson({
        'key': 'secret',
        'type': 'pin',
        'label': 'PIN',
        'required': true,
      }),
      throwsFormatException,
    );
  });

  test('selection fields require server-described options', () {
    expect(
      () => TransactionFormFieldDefinition.fromJson({
        'key': 'network',
        'type': 'selection',
        'label': 'Network',
        'required': true,
      }),
      throwsFormatException,
    );
  });

  test('PIN is never a server-described form primitive', () {
    expect(
      TransactionFormFieldDefinition.supportedTypes,
      isNot(contains('pin')),
    );
  });
}
