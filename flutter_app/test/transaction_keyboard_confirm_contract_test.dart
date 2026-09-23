import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('Cash In Out removes redundant transaction heading', () {
    expect(source, isNot(contains("'Choose transaction'")));
    expect(source, contains("'CASH IN'"));
    expect(source, contains("'CASH OUT'"));
  });

  test('transaction form explicitly resizes for keyboard', () {
    expect(
      source,
      contains('resizeToAvoidBottomInset: true'),
    );
  });

  test('primary transaction action is persistent outside scroll body', () {
    final scroll = source.indexOf('SingleChildScrollView(');
    final bottomBar = source.indexOf('bottomNavigationBar: SafeArea(');
    final proceed = source.indexOf(
      "'Proceed to \${_needsAmount ? 'Confirm' : 'Execute'}'",
    );

    expect(scroll, greaterThanOrEqualTo(0));
    expect(bottomBar, greaterThan(scroll));
    expect(proceed, greaterThan(bottomBar));
  });

  test('sticky action accounts for keyboard inset', () {
    expect(
      source,
      contains('MediaQuery.viewInsetsOf(context).bottom'),
    );
    expect(source, contains('AnimatedPadding('));
  });

  test('Phone and Amount prominent typography is preserved', () {
    expect(source, contains('fontSize: 30'));
  });

  test('service fee stays below amount and before primary action', () {
    final amount = source.indexOf("labelText: 'Amount (GH₵)'");
    final fee = source.indexOf(
      "labelText: 'Agent Service Fee (GH₵)'",
    );
    final checkbox = source.indexOf(
      "'Charge agent service fee'",
    );
    final bottomBar = source.indexOf(
      'bottomNavigationBar: SafeArea(',
    );

    expect(amount, greaterThanOrEqualTo(0));
    expect(fee, greaterThan(amount));
    expect(checkbox, greaterThan(fee));
    expect(bottomBar, greaterThan(checkbox));
  });

  test('redundant MoMo PIN notice is removed from form', () {
    expect(
      source,
      isNot(
        contains(
          'You will enter your MoMo PIN only on the official '
          'network USSD screen.',
        ),
      ),
    );
  });

  test('manual Cash Out keeps its correct primary action', () {
    expect(source, contains("'Record Cash Out'"));
    expect(source, contains('_isManualCashOut'));
  });
}
