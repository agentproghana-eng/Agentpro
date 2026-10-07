import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final catalog = File(
    'lib/features/ussd_settings/quick_action_catalog.dart',
  ).readAsStringSync();

  final renderer = File(
    'lib/features/transactions/widgets/'
    'server_driven_transaction_form.dart',
  ).readAsStringSync();

  final screen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('malformed V2 form fields fail closed', () {
    expect(
      catalog,
      contains('_parseTransactionFormFields'),
    );

    expect(
      catalog,
      contains(
        'Transaction form_fields entries must be objects',
      ),
    );

    expect(
      catalog,
      contains('Duplicate transaction form field key'),
    );

    final formFieldParserStart =
        catalog.indexOf('_parseTransactionFormFields(');

    expect(formFieldParserStart, greaterThanOrEqualTo(0));

    final parserTail =
        catalog.substring(formFieldParserStart);

    expect(
      parserTail,
      isNot(contains('.whereType<Map>()')),
    );
  });

  test('duplicate selection option values fail closed', () {
    expect(
      catalog,
      contains('Duplicate transaction form option value'),
    );
  });

  test('required JSON metadata uses a non-keyword model name', () {
    expect(catalog, contains('final bool isRequired;'));
    expect(catalog, contains("'required': isRequired"));
    expect(renderer, contains('field.isRequired'));
  });

  test('operator and account identifiers are not forced numeric', () {
    expect(
      renderer,
      contains(
        "'operator_id' => TextInputType.text",
      ),
    );

    expect(
      renderer,
      contains(
        "'account_number' => TextInputType.text",
      ),
    );

    expect(
      renderer,
      isNot(
        contains(
          "field.type == 'account_number' ||",
        ),
      ),
    );

    expect(
      renderer,
      isNot(
        contains(
          "field.type == 'operator_id')",
        ),
      ),
    );
  });

  test('parent transaction Form owns validation', () {
    expect(
      screen,
      contains(
        "if (_formKey.currentState?.validate() != true) return;",
      ),
    );

    expect(
      screen,
      isNot(contains('_serverDrivenFormKey')),
    );
  });

  test('PIN is not a renderer primitive', () {
    expect(
      catalog,
      isNot(contains("'pin',")),
    );
  });
}
