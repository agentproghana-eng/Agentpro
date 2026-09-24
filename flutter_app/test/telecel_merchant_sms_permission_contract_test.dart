import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transactionScreen = File(
    'lib/features/transactions/transaction_screen.dart',
  );

  final mainActivity = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/MainActivity.kt',
  );

  final smsChannel = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'TelecelMerchantBalanceSmsChannel.kt',
  );

  test('Telecel Merchant balance enquiry requests RECEIVE_SMS before USSD', () {
    final source = transactionScreen.readAsStringSync();

    expect(
      source,
      contains("_selectedProvider == 'telecel'"),
    );
    expect(
      source,
      contains("businessSimRole == 'merchant'"),
    );
    expect(
      source,
      contains("_transactionType == 'balance_enquiry'"),
    );
    expect(
      source,
      contains("'requestReceiveSmsPermission'"),
    );

    final permission =
        source.indexOf("'requestReceiveSmsPermission'");
    final transactionStart =
        source.indexOf('_initiateOnlineTransaction(');

    expect(permission, greaterThanOrEqualTo(0));
    expect(transactionStart, greaterThan(permission));
  });

  test('Telecel native channel owns a distinct RECEIVE_SMS request', () {
    final source = smsChannel.readAsStringSync();

    expect(
      source,
      contains('Manifest.permission.RECEIVE_SMS'),
    );
    expect(
      source,
      contains('REQUEST_RECEIVE_SMS = 7402'),
    );
    expect(
      source,
      contains('"hasReceiveSmsPermission"'),
    );
    expect(
      source,
      contains('"requestReceiveSmsPermission"'),
    );
    expect(
      source,
      contains('onRequestPermissionsResult('),
    );
    expect(
      source,
      isNot(contains('Manifest.permission.READ_SMS')),
    );
  });

  test('MainActivity forwards Telecel permission results', () {
    final source = mainActivity.readAsStringSync();

    expect(
      source,
      contains(
        'private lateinit var telecelMerchantBalanceSmsChannel:',
      ),
    );
    expect(
      source,
      contains('telecelMerchantBalanceSmsChannel'),
    );
    expect(
      source,
      contains('.onRequestPermissionsResult('),
    );
    expect(
      source,
      contains('::mtnCashOutSmsChannel.isInitialized'),
    );
  });
}
