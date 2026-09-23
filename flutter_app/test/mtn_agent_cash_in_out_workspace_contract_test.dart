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

  group('MTN Agent Cash In/Out workspace', () {
    test('workspace never invents a backend transaction type', () {
      expect(
        transaction,
        contains(
          "String _mtnCashInOutOperation = 'send_money';",
        ),
      );

      expect(
        transaction,
        contains(
          "_mtnCashInOutOperation = 'cash_out';",
        ),
      );

      expect(
        transaction,
        isNot(contains("'cash_in_out'")),
      );

      expect(
        router,
        isNot(contains("transactionType: 'cash_in_out'")),
      );
    });

    test('workspace exposes Cash In and Cash Out choices', () {
      expect(transaction, contains("'CASH IN'"));
      expect(transaction, contains("'CASH OUT'"));
      expect(
        transaction,
        contains('mtnCashInOutWorkspace'),
      );
    });

    test('MTN Agent dashboard renders one combined cash tile', () {
      expect(
        dashboard,
        contains(
          "provider == 'mtn' && role == 'agent' && type == 'send_money'",
        ),
      );

      expect(
        dashboard,
        contains(
          "provider == 'mtn' && role == 'agent' && type == 'cash_out'",
        ),
      );

      expect(
        dashboard,
        contains("'Cash In/Out'"),
      );

      expect(
        dashboard,
        contains("'/transactions/mtn-cash-in-out'"),
      );
    });

    test('workspace route is MTN-only and preserves physical SIM identity', () {
      expect(
        router,
        contains("path: '/transactions/mtn-cash-in-out'"),
      );

      expect(
        router,
        contains("initialProvider: 'mtn'"),
      );

      expect(
        router,
        contains('initialSimSlot:'),
      );

      expect(
        router,
        contains('initialSimIccid: simIccid'),
      );

      expect(
        router,
        contains('initialSimSubscriptionId:'),
      );

      expect(
        router,
        contains('mtnCashInOutWorkspace: true'),
      );
    });

    test('cash in keeps canonical send_money identity', () {
      expect(
        router,
        contains("transactionType: 'send_money'"),
      );

      expect(
        transaction,
        contains(
          "widget.mtnCashInOutWorkspace\n"
          "      ? _mtnCashInOutOperation\n"
          "      : widget.transactionType",
        ),
      );
    });

    test('service fee remains opt-in for MTN Cash In', () {
      expect(
        transaction,
        contains(
          "bool get _isMtnCashIn =>\n"
          "      _transactionType == 'send_money'",
        ),
      );

      expect(
        transaction,
        contains(
          'bool get _isAgentServiceFeeFlow => _isMtnCashIn || _isDeposit;',
        ),
      );

      expect(
        transaction,
        contains(
          "'fee': _isAgentServiceFeeFlow && _agentServiceFeeEnabled",
        ),
      );
    });

    test('reference remains visually secondary', () {
      expect(
        transaction,
        contains('transactionValueFontSize: 20'),
      );
    });

    test('Telecel and AT Money manual Cash Out remain isolated', () {
      expect(
        transaction,
        contains(
          "_transactionType == 'cash_out' &&",
        ),
      );

      expect(
        transaction,
        contains(
          "(_selectedProvider == 'telecel' || _selectedProvider == 'at_money')",
        ),
      );

      expect(
        transaction,
        contains("'/balances/cash-out-manual'"),
      );
    });
  });
}
