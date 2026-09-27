import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/widgets/'
    'server_driven_transaction_form.dart',
  ).readAsStringSync();

  test('renderer consumes server form definitions', () {
    expect(
      source,
      contains(
        'List<TransactionFormFieldDefinition> fields',
      ),
    );
    expect(
      source,
      contains(
        "field.type == 'selection'",
      ),
    );
  });

  test('renderer supports the V2 primitive set generically', () {
    expect(source, contains("'phone'"));
    expect(source, contains("'amount'"));
    expect(source, contains("'digits'"));
    expect(source, contains("'account_number'"));
    expect(source, contains("'operator_id'"));
    expect(source, contains('TextInputType.text'));
  });

  test('renderer never renders or collects PIN', () {
    expect(
      source,
      isNot(contains("'pin'")),
    );
    expect(
      source.toLowerCase(),
      isNot(contains('pincontroller')),
    );
  });

  test('renderer validates required and length constraints', () {
    expect(
      source,
      contains('field.isRequired && value.isEmpty'),
    );
    expect(
      source,
      contains('field.minLength'),
    );
    expect(
      source,
      contains('field.maxLength'),
    );
  });

  test('renderer exposes values by server field key', () {
    expect(
      source,
      contains('result[field.key] = value'),
    );
    expect(
      source,
      contains('Map<String, String> values()'),
    );
  });
}
