import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transactionScreen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  test('Telecel Merchant withdrawal is isolated from Agent manual cash out', () {
    expect(
      transactionScreen,
      contains("bool get _isTelecelMerchantWithdrawal"),
    );
    expect(
      transactionScreen,
      contains("_selectedBusinessSimRole == 'merchant'"),
    );
    expect(
      transactionScreen,
      contains("!_isTelecelMerchantWithdrawal"),
    );
    expect(
      transactionScreen,
      contains("final isTelecelTillNumber"),
    );
  });

  test('Telecel Merchant dashboard exposes withdrawal', () {
    final start = dashboard.indexOf(
      'const telecelMerchantDefaults = <String>[',
    );
    expect(start, greaterThanOrEqualTo(0));

    final end = dashboard.indexOf('];', start);
    expect(end, greaterThan(start));

    final defaults = dashboard.substring(start, end);
    expect(defaults, contains("'cash_out'"));
  });

  test('existing Merchant profiles receive withdrawal without duplication', () {
    expect(
      dashboard,
      contains(
        "!ordered.any((item) => item.actionKey == 'cash_out')",
      ),
    );
    expect(
      dashboard,
      contains("actionKey: 'cash_out'"),
    );
  });
}
