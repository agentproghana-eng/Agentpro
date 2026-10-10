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
          RegExp(r"_mtnCashInOutOperation\s*=\s*'cash_out';"),
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

    test('workspace uses Cash In and Cash Out as form actions', () {
      expect(transaction, contains("child: const Text('Cash In')"));
      expect(transaction, contains("child: const Text('Cash Out')"));
      expect(transaction, contains('mtnCashInOutWorkspace'));

      expect(
        transaction,
        contains(
          'if (!_isMtnCashInOutWorkspace &&\n              !_isMtnPayToWorkspace &&\n              !_isMtnAgentDataWorkspace &&\n              !_isMtnAgentAirtimeWorkspace &&\n              !_isStandaloneMtnAgentCash)',
        ),
      );

      expect(transaction, isNot(contains("'CASH IN'")));
      expect(transaction, isNot(contains("'CASH OUT'")));
    });

    test('cash workspace uses compact icon-free five-button layout', () {
      final start = transaction.indexOf(
        '// MTN Agent Cash In/Out: compact, text-only actions.',
      );
      final end = transaction.indexOf(
        'if (_isMtnAgentAirtimeWorkspace) ...[',
        start,
      );
      final block = transaction.substring(
        start,
        transaction.indexOf(
          'if (_isStandaloneMtnAgentCash) ...[',
          start,
        ),
      );

      for (final label in [
        'Cash In',
        'Cash Out',
        'Balance',
        'Cash In Commission',
        'Cash Out Commission',
      ]) {
        expect(block, contains("Text('$label')"));
      }

      expect(block, contains('minimumSize: const Size(0, 44)'));
      expect(block, contains('maximumSize: const Size(double.infinity, 44)'));
      expect(block, contains('backgroundColor: AppTheme.primaryColor'));
      expect(block, contains('width: 170'));
      expect(block, contains('style: style(13)'));
      expect(block, contains('style: style(14)'));
      expect(block, isNot(contains('icon:')));
      expect(block, isNot(contains('AppButton(')));
      expect(block, contains("'balance_enquiry'"));
      expect(block, contains("'cash_in_commission'"));
      expect(block, contains("'commission_balance'"));
      expect(
        RegExp(r'_openMtnAgentCashEnquiry\(')
            .allMatches(block)
            .length,
        3,
      );
      expect(
        RegExp(r'_proceed\(\);').allMatches(block).length,
        2,
      );
      expect(block, contains("'send_money'"));
      expect(block, contains("'cash_out'"));
      expect(block, contains('_agentServiceFeeEnabled = false;'));
      expect(block, contains("_feeCtrl.text = '0.00';"));
    });

    test('MTN Agent dashboard supports combined and individual cash actions', () {
      expect(
        dashboard,
        contains(
          "provider == 'mtn' && role == 'agent' && type == 'send_money'",
        ),
      );

      expect(
        dashboard,
        isNot(
          contains(
            "if (provider == 'mtn' && role == 'agent' && type == 'cash_out')",
          ),
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
          "if (widget.mtnCashInOutWorkspace) {\n"
          "      return _activeMtnCashEnquiry ?? _mtnCashInOutOperation;\n"
          "    }",
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
          "'fee': !_workspaceZeroInput && _isAgentServiceFeeFlow && _agentServiceFeeEnabled",
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
