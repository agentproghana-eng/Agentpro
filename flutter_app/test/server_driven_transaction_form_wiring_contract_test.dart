import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final dashboard = File(
    'lib/features/dashboard/widgets/'
    'dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final router = File(
    'lib/core/router/app_router.dart',
  ).readAsStringSync();

  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('business Quick Action carries V2 definition outside URL', () {
    expect(
      dashboard,
      contains('definition.formFields.isNotEmpty'),
    );
    expect(
      dashboard,
      contains('extra: role != \'subscriber\''),
    );

    // The form schema must not be serialized into query parameters.
    expect(
      dashboard,
      isNot(contains("'form_fields':")),
    );
  });

  test('router accepts only matching provider and transaction identity', () {
    expect(
      router,
      contains('routeExtra is QuickActionCatalogDefinition'),
    );
    expect(
      router,
      contains('routeExtra.provider.trim().toLowerCase()'),
    );
    expect(
      router,
      contains('routeExtra.type.trim().toLowerCase()'),
    );
    expect(
      router,
      contains('catalogDefinition: catalogDefinition'),
    );
  });

  test('transaction screen renders V2 fields only when identity matches', () {
    expect(
      transaction,
      contains('bool get _usesServerDrivenForm'),
    );
    expect(
      transaction,
      contains('definition.formFields.isEmpty'),
    );
    expect(
      transaction,
      contains('ServerDrivenTransactionForm('),
    );
    expect(
      transaction,
      contains('fields: widget.catalogDefinition!.formFields'),
    );
  });

  test('special workspaces remain on their proven legacy UI', () {
    expect(
      transaction,
      contains('widget.mtnCashInOutWorkspace'),
    );
    expect(
      transaction,
      contains('widget.telecelMerchantECashWorkspace'),
    );
  });

  test(
    'server-driven values reach only the allowlisted payload adapter',
    () {
      expect(
        transaction,
        contains('_serverDrivenFormValues'),
      );
      expect(
        transaction,
        contains('ServerDrivenTransactionSubmission('),
      );
      expect(
        transaction,
        contains('_serverDrivenSubmission.toRequestFields()'),
      );

      // Remote form values must never be spread directly into the API body.
      expect(
        transaction,
        isNot(contains('..._serverDrivenFormValues')),
      );
    },
  );

  test('PIN remains outside remotely rendered transaction fields', () {
    expect(
      transaction,
      isNot(contains("formFields['pin']")),
    );
  });
}
