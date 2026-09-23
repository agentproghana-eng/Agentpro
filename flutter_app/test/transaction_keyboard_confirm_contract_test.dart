import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('Cash In Out keeps direct operation selector', () {
    expect(source, isNot(contains("'Choose transaction'")));
    expect(source, contains("'CASH IN'"));
    expect(source, contains("'CASH OUT'"));
  });

  test('transaction workspace resizes for Android keyboard', () {
    expect(
      source,
      contains('resizeToAvoidBottomInset: true'),
    );
  });

  test('primary action is part of resized body rather than bottom bar', () {
    final body = source.indexOf('body: Column(');
    final expanded = source.indexOf('Expanded(', body);
    final form = source.indexOf('child: Form(', expanded);
    final scroll = source.indexOf('SingleChildScrollView(', form);

    final proceed = source.indexOf(
      "'Proceed to \${_needsAmount ? 'Confirm' : 'Execute'}'",
      scroll,
    );

    expect(body, greaterThanOrEqualTo(0));
    expect(expanded, greaterThan(body));
    expect(form, greaterThan(expanded));
    expect(scroll, greaterThan(form));
    expect(proceed, greaterThan(scroll));

    expect(
      source,
      isNot(contains('bottomNavigationBar: SafeArea(')),
    );

    expect(
      source,
      isNot(contains('AnimatedPadding(')),
    );

    expect(
      source,
      isNot(
        contains('MediaQuery.viewInsetsOf(context).bottom'),
      ),
    );
  });

  test('transaction Phone and Amount emphasis remains 30px', () {
    expect(source, contains('fontSize: 30'));
  });

  test('service fee toggle remains directly before primary action', () {
    final fee = source.indexOf(
      "labelText: 'Agent Service Fee (GH₵)'",
    );

    final checkbox = source.indexOf(
      "'Charge agent service fee'",
      fee,
    );

    final proceed = source.indexOf(
      "'Proceed to \${_needsAmount ? 'Confirm' : 'Execute'}'",
      checkbox,
    );

    expect(fee, greaterThanOrEqualTo(0));
    expect(checkbox, greaterThan(fee));
    expect(proceed, greaterThan(checkbox));

    expect(source, contains('dense: true'));
    expect(source, contains('horizontal: -2'));
    expect(source, contains('vertical: -4'));
    expect(source, contains('fontSize: 13'));
  });

  test('manual Cash Out retains record action', () {
    expect(source, contains("'Record Cash Out'"));
    expect(source, contains('_isManualCashOut'));
  });

  test('ordinary MoMo PIN warning remains removed', () {
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
}
