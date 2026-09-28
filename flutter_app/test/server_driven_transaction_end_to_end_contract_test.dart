import 'package:agent_pro_ghana/features/transactions/server_driven_transaction_submission.dart';
import 'package:agent_pro_ghana/features/transactions/widgets/server_driven_transaction_form.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_catalog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'V2 catalog renders a new generic transaction and emits only '
    'allowlisted request fields',
    (tester) async {
      // This deliberately uses a provider/transaction pair with no
      // transaction-specific Flutter form implementation. The only UI
      // definition comes from server-shaped V2 catalog data.
      final catalog = QuickActionCatalog.fromCacheJson({
        'mode': 'business',
        'role': 'agent',
        'schema_version': 2,
        'providers': [
          {
            'provider': 'future_money',
            'actions': [
              {
                'provider': 'future_money',
                'transaction_type': 'merchant_payment',
                'display_label': 'Future Merchant Payment',
                'quick_action_group': 'Transfers & Payments',
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
                  {
                    'key': 'merchant_id',
                    'type': 'text',
                    'label': 'Merchant ID',
                    'required': true,
                  },
                  {
                    'key': 'reference',
                    'type': 'reference',
                    'label': 'Reference',
                    'required': true,
                  },

                  // Defense-in-depth fixture: even if malformed or
                  // compromised catalog data reached the mobile client,
                  // arbitrary keys must never enter the API payload.
                  {
                    'key': 'unexpected_remote_key',
                    'type': 'text',
                    'label': 'Unexpected Remote Value',
                    'required': false,
                  },
                ],
              },
            ],
          },
        ],
      });

      final definition =
          catalog.definitionFor(
            'future_money',
            'merchant_payment',
          )!;

      expect(definition.formFields, hasLength(5));

      Map<String, String> latestValues =
          const <String, String>{};

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Form(
              child: ServerDrivenTransactionForm(
                fields: definition.formFields,
                onChanged: (values) {
                  latestValues = values;
                },
              ),
            ),
          ),
        ),
      );

      expect(
        find.text('Customer Number'),
        findsOneWidget,
      );
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('Merchant ID'), findsOneWidget);
      expect(find.text('Reference'), findsOneWidget);

      final inputs = find.byType(TextFormField);

      expect(inputs, findsNWidgets(5));

      await tester.enterText(
        inputs.at(0),
        '0241234567',
      );
      await tester.enterText(
        inputs.at(1),
        '125.50',
      );
      await tester.enterText(
        inputs.at(2),
        'MERCHANT-42',
      );
      await tester.enterText(
        inputs.at(3),
        'Invoice 42',
      );
      await tester.enterText(
        inputs.at(4),
        'must-not-leak',
      );

      await tester.pump();

      final requestFields =
          ServerDrivenTransactionSubmission(
            latestValues,
          ).toRequestFields();

      expect(
        requestFields,
        <String, dynamic>{
          'amount': 125.50,
          'customer_phone': '0241234567',
          'recipient_phone': '',
          'account_number': '',
          'payment_reference': 'Invoice 42',
          'merchant_id': 'MERCHANT-42',
        },
      );

      expect(
        requestFields,
        isNot(
          contains('unexpected_remote_key'),
        ),
      );

      expect(
        requestFields,
        isNot(
          contains('pin'),
        ),
      );
    },
  );

  test(
    'submission adapter never spreads unsupported or sensitive keys',
    () {
      final requestFields =
          ServerDrivenTransactionSubmission({
            'amount': '50',
            'recipient_phone': '0201234567',
            'reference': 'REF-1',
            'pin': '1234',
            'password': 'secret',
            'ledger_account': 'wallet-x',
            'posting_policy': 'remote',
            'arbitrary': 'value',
          }).toRequestFields();

      expect(requestFields['amount'], 50);
      expect(
        requestFields['recipient_phone'],
        '0201234567',
      );
      expect(
        requestFields['payment_reference'],
        'REF-1',
      );

      expect(requestFields, isNot(contains('pin')));
      expect(
        requestFields,
        isNot(contains('password')),
      );
      expect(
        requestFields,
        isNot(contains('ledger_account')),
      );
      expect(
        requestFields,
        isNot(contains('posting_policy')),
      );
      expect(
        requestFields,
        isNot(contains('arbitrary')),
      );
    },
  );
}
