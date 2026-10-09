import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MTN Agent cash enquiries use distinct canonical routes', () {
    final source = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    expect(source, contains('void _openMtnAgentCashEnquiry('));
    expect(source, contains("path: '/transactions'"));
    expect(source, contains("'auto_start': '1'"));
    expect(source, contains("'sim_slot': sim.slot.toString()"));
    expect(source, contains("'sim_subscription_id': sim.subscriptionId.toString()"));

    for (final type in [
      'balance_enquiry',
      'cash_in_commission',
      'commission_balance',
    ]) {
      expect(
        RegExp(
          r"_openMtnAgentCashEnquiry\(\s*'" + type + r"'",
        ).hasMatch(source),
        isTrue,
        reason: 'Missing enquiry mapping for $type',
      );
    }

    expect(source, contains("child: Text('Cash Out Commission')"));
    expect(source, contains("child: Text('Cash In Commission')"));
    expect(source, contains("child: const Text('Balance')"));
  });
}
