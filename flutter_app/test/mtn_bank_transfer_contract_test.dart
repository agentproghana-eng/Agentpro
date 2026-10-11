import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  test('MTN bank transfer reuses the bank form with a direct-number list', () {
    expect(screen, contains('_isMtnBankTransfer'));
    expect(screen, contains('_isBankTransfer'));
    expect(screen, contains('_mtnBanks'));
    expect(screen, contains('_mtnBankSelections'));
    expect(screen, isNot(contains('_mtnBankPageCount')));
    expect(RegExp(r"'\d+',\n").allMatches(screen).length, greaterThanOrEqualTo(45));
  });

  test('has a single account number field', () {
    expect(
      RegExp('controller: _accountNumberCtrl').allMatches(screen).length,
      1,
    );
  });

  test('requires a reference for MTN bank transfers', () {
    expect(screen, contains("widget.provider == 'mtn'"));
    expect(screen, contains("type == 'send_money_to_bank'"));
  });
}
