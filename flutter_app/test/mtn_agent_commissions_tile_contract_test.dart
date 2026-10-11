import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String read(String path) => File(path).readAsStringSync();

  final transaction = read('lib/features/transactions/transaction_screen.dart');
  final dashboard = read(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  );
  final router = read('lib/core/router/app_router.dart');
  final customization = read(
    'lib/features/ussd_settings/quick_action_customization_screen.dart',
  );

  test('one Commissions tile opens the commissions page', () {
    expect(
      dashboard,
      contains("provider == 'mtn' && role == 'agent' && type == 'commissions'"),
    );
    expect(dashboard, contains("'/transactions/mtn-commissions'"));
    expect(dashboard, contains('!isMtnAgentCommissions &&'));
    expect(dashboard, contains('_withCommissionsTile('));
    expect(customization, contains("type: 'commissions'"));
    expect(router, contains("path: '/transactions/mtn-commissions'"));
    expect(router, contains('mtnCommissionsWorkspace: true'));
  });

  test('page has two side by side enquiries and a centered transfer', () {
    final start = transaction.indexOf('Widget _buildMtnCommissionsActions()');
    expect(start, greaterThanOrEqualTo(0));
    final block = transaction.substring(start);

    final cashIn = block.indexOf("'cash_in_commission'");
    final cashOut = block.indexOf("'commission_balance'");
    final transfer = block.indexOf("Text('Transfer Commission')");

    expect(cashIn, greaterThanOrEqualTo(0));
    expect(cashOut, greaterThan(cashIn));
    expect(transfer, greaterThan(cashOut));
    expect(block, contains('Row('));
    expect(block, contains('Center('));
    expect(block, contains("Text('Confirm Transfer')"));
  });

  test('only Transfer Commission asks for an amount', () {
    expect(transaction, contains('bool _commissionTransferChosen = false;'));
    expect(transaction, contains("_mtnCashInOutOperation = 'commission_transfer';"));
    expect(transaction, contains('!_isMtnCommissionsMode &&'));
    expect(transaction, contains("? 'Commissions' : 'Cash In/Out'"));
  });
}
