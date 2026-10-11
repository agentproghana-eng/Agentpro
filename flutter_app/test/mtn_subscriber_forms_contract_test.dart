import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  test('balance labels are MoMo Balance and Mashup Balance', () {
    expect(screen, contains("'check_momo_balance': 'MoMo Balance'"));
    expect(screen, contains("'check_airtime_balance': 'Mashup Balance'"));
    expect(screen, isNot(contains("'Check MoMo Balance'")));
  });

  test('Allow Cash Out and My Approvals do not say "enquiry"', () {
    expect(screen, contains("'allow_cash_out' =>"));
    expect(screen, contains("'my_approvals' =>"));
    expect(screen, contains('Enter your PIN on'));
  });

  test('MTN bank transfer uses a searchable bank picker', () {
    expect(screen, contains('_buildMtnBankPicker()'));
    expect(screen, contains('class _BankPickerSheet'));
    expect(screen, contains("hintText: 'Search banks'"));
  });
}
