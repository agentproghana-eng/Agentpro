import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final router = File(
    'lib/core/router/app_router.dart',
  ).readAsStringSync();

  group('MTN Agent Pay To workspace', () {
    test('uses only certified canonical transaction identities', () {
      expect(
        transaction,
        contains("String _mtnPayToOperation = 'pay_to_agent';"),
      );

      expect(
        transaction,
        contains("_mtnPayToOperation = 'merchant_payment';"),
      );

      expect(
        transaction,
        isNot(contains("'pay_to_workspace'")),
      );
    });

    test('uses Agent and Merchant as form actions', () {
      expect(transaction, contains("label: 'Agent'"));
      expect(transaction, contains("label: 'Merchant'"));

      expect(
        transaction,
        contains(
          'if (!_isMtnCashInOutWorkspace &&\n              !_isMtnPayToWorkspace &&\n              !_isMtnAgentDataWorkspace &&\n              !_isMtnAgentAirtimeWorkspace &&\n              !_isStandaloneMtnAgentCash)',
        ),
      );
    });

    test('uses one shared identifier field', () {
      expect(
        transaction,
        contains("'Mobile Number / Merchant ID'"),
      );

      expect(
        transaction,
        contains("'Enter mobile number or merchant ID'"),
      );
    });

    test('Pay to Agent keeps 10 digit mobile validation', () {
      expect(
        transaction,
        contains("RegExp(r'^\\d{10}\$')"),
      );

      expect(
        transaction,
        contains("'Enter a valid 10-digit mobile number'"),
      );
    });

    test('Pay to Merchant requires Merchant ID', () {
      expect(
        transaction,
        contains(
          "_transactionType == 'merchant_payment'",
        ),
      );

      expect(
        transaction,
        contains("'Merchant ID is required'"),
      );
    });

    test('maps the shared identifier to correct canonical payloads', () {
      expect(
        transaction,
        contains(
          "(_isMtnPayToWorkspace && _transactionType == 'pay_to_agent')",
        ),
      );

      expect(
        transaction,
        contains(
          "_isMtnPayToWorkspace && _transactionType == 'merchant_payment'",
        ),
      );

      expect(
        transaction,
        contains('return _recipientPhoneCtrl.text.trim();'),
      );
    });

    test('route is MTN locked and preserves physical SIM identity', () {
      expect(router, contains("path: '/transactions/mtn-pay-to'"));
      expect(router, contains("transactionType: 'pay_to_agent'"));
      expect(router, contains("initialProvider: 'mtn'"));
      expect(router, contains('initialSimSlot:'));
      expect(router, contains('initialSimIccid: simIccid'));
      expect(router, contains('initialSimSubscriptionId:'));
      expect(router, contains('mtnPayToWorkspace: true'));
    });

    test('both canonical quick actions enter the shared workspace', () {
      expect(
        dashboard,
        contains(
          "(type == 'pay_to_agent' || type == 'merchant_payment')",
        ),
      );

      expect(
        dashboard,
        contains("'/transactions/mtn-pay-to'"),
      );
    });
  });
}
