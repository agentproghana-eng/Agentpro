import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String screen;
  late String bankModel;
  late String dashboard;

  setUpAll(() {
    screen = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    bankModel = File(
      'lib/features/transactions/models/'
      'telecel_merchant_bank_selections.dart',
    ).readAsStringSync();

    dashboard = File(
      'lib/features/dashboard/widgets/'
      'dashboard_quick_actions_section.dart',
    ).readAsStringSync();
  });

  test('Merchant Send Money preserves distinct transaction identities', () {
    expect(screen, contains("'send_money_same_network'"));
    expect(screen, contains("'send_money_cross_network'"));
    expect(
      screen,
      contains('_isTelecelMerchantSendMoneyWorkspace'),
    );
  });

  test('Merchant outgoing flows do not use generic customer field', () {
    final start = screen.indexOf('bool get _needsCustomer');
    expect(start, greaterThanOrEqualTo(0));

    final end = screen.indexOf(';', start);
    expect(end, greaterThan(start));

    final section = screen.substring(start, end + 1);

    expect(section, contains("'send_money_same_network'"));
    expect(section, contains("'send_money_cross_network'"));
    expect(section, contains("'send_money_to_bank'"));
  });

  test('Merchant Send Money uses recipient phone field', () {
    final start = screen.indexOf('bool get _needsRecipient');
    expect(start, greaterThanOrEqualTo(0));

    final end = screen.indexOf(';', start);
    final section = screen.substring(start, end + 1);

    expect(
      section,
      contains('_isTelecelMerchantSendMoneyWorkspace'),
    );
  });

  test('Merchant reference handling does not reuse MTN provider lock', () {
    expect(
      screen,
      contains('bool get _needsTelecelMerchantReference'),
    );

    expect(
      screen,
      contains('_needsReference ||'),
    );
  });

  test('Merchant bank map has exactly 29 provider menu entries', () {
    final matches = RegExp(
      r"^\s*'[^']+': \['[1-4]', '[0-9]+'\],",
      multiLine: true,
    ).allMatches(bankModel);

    expect(matches.length, 29);
  });

  test('Merchant bank mapping remains independent from Personal', () {
    expect(
      bankModel,
      isNot(contains('personal_transaction_screen')),
    );
    expect(
      bankModel,
      isNot(contains('kTelecelBankSelections')),
    );
  });

  test('bank account controller participates in lifecycle disposal', () {
    final start = screen.indexOf('void dispose()');
    expect(start, greaterThanOrEqualTo(0));

    final section = screen.substring(start);

    expect(section, contains('_accountNumberCtrl'));
  });

  test('Merchant outgoing actions are not fallback-enabled yet', () {
    final start = dashboard.indexOf(
      'const telecelMerchantDefaults',
    );
    expect(start, greaterThanOrEqualTo(0));

    final end = dashboard.indexOf('];', start);
    final defaults = dashboard.substring(start, end + 2);

    expect(defaults, contains("'airtime'"));
    expect(defaults, contains("'balance_enquiry'"));
    expect(defaults, contains("'float_to_working'"));

    expect(defaults, isNot(contains("'send_money'")));
    expect(defaults, isNot(contains("'send_money_to_bank'")));
  });
}
