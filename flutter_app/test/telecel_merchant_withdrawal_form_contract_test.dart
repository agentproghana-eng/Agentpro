import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String screen;
  late String migration;

  setUpAll(() {
    screen = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    migration = File(
      '../backend/migrations/162_telecel_merchant_agent_till_withdrawal.sql',
    ).readAsStringSync();
  });

  test('Merchant withdrawal identifies the external counterparty as Till Number', () {
    expect(screen, contains("'Till Number'"));
    expect(screen, contains("'Enter till number'"));
    expect(screen, contains('Icons.storefront_outlined'));
  });

  test('Merchant Till Number accepts alphanumeric identifiers', () {
    expect(
      screen,
      contains(r"RegExp(r'^[A-Za-z0-9]+$')"),
    );
    expect(
      screen,
      contains("'Enter a valid alphanumeric till number'"),
    );
  });

  test('Merchant Till Number uses a text keyboard rather than phone keyboard', () {
    expect(
      screen,
      contains(
        "_isTelecelMerchantWithdrawal\n"
        "                      ? TextInputType.text\n"
        "                      : TextInputType.phone",
      ),
    );
  });

  test('Merchant withdrawal requires an amount', () {
    expect(
      screen,
      contains("bool get _needsAmount =>"),
    );
    expect(
      screen,
      isNot(
        contains(
          "'cash_out',\n"
          "        'balance_enquiry'",
        ),
      ),
    );
    expect(screen, contains("labelText: 'Amount (GH₵)'"));
    expect(migration, contains("ARRAY['enter amount']"));
    expect(
      migration,
      contains("'send_amount'::ussd_flow_action"),
    );
  });

  test('existing live USSD sequence remains compatible', () {
    expect(migration, contains("ARRAY['enter till number']"));
    expect(
      migration,
      contains("'send_customer_phone'::ussd_flow_action"),
    );
    expect(migration, contains("ARRAY['enter operator id']"));
    expect(
      migration,
      contains("'send_operator_id'::ussd_flow_action"),
    );
    expect(migration, contains("ARRAY['enter pin']"));
    expect(
      migration,
      contains("'pin_prompt'::ussd_flow_action"),
    );
  });

  test('PIN remains manual', () {
    expect(migration, isNot(contains("'send_pin'")));
  });
}
