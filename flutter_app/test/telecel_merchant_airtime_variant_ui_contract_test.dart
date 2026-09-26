import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transactionScreen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final quickActionPreference = File(
    'lib/features/ussd_settings/quick_action_preference.dart',
  ).readAsStringSync();

  test('Telecel Merchant Airtime Self does not request a customer phone', () {
    expect(
      transactionScreen,
      contains("bool get _isTelecelAirtimeSelf"),
    );
    expect(
      transactionScreen,
      contains("_selectedProvider == 'telecel'"),
    );
    expect(
      transactionScreen,
      contains("_transactionType == 'airtime'"),
    );
    expect(
      transactionScreen,
      contains("_initialRecipientMode?.toLowerCase() == 'self'"),
    );
    expect(
      transactionScreen,
      contains("!_isTelecelAirtimeSelf"),
    );
  });

  test('Telecel Merchant Airtime Other keeps the normal phone validation path', () {
    expect(
      transactionScreen,
      contains("RegExp(r'^\\d{10}\$').hasMatch(value)"),
    );

    // Only Self is excluded from _needsCustomer. Other therefore continues
    // through the standard customer-phone form and validation.
    expect(
      transactionScreen,
      isNot(contains(
        "_initialRecipientMode?.toLowerCase() == 'other' &&",
      )),
    );
  });

  test('business Airtime quick actions preserve recipient mode', () {
    final airtimeStart =
        quickActionPreference.indexOf("if (actionKey == 'buy_airtime')");
    expect(airtimeStart, greaterThanOrEqualTo(0));

    final followingSection = quickActionPreference.indexOf(
      'final bundleCategory =',
      airtimeStart,
    );
    expect(followingSection, greaterThan(airtimeStart));

    final airtimeBlock = quickActionPreference.substring(
      airtimeStart,
      followingSection,
    );

    expect(airtimeBlock, contains('preference.copyWith('));
    expect(airtimeBlock, contains('clearBundleCategory: true'));
    expect(airtimeBlock, isNot(contains('clearRecipientMode: true')));
  });
}
