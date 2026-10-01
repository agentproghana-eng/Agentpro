import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('Telecel Merchant E-Cash enforces the live GHS 1 minimum', () {
    expect(
      source,
      contains('bool get _requiresTelecelMerchantECashMinimum'),
    );
    expect(source, contains("'float_to_working'"));
    expect(source, contains("'working_to_float'"));
    expect(
      source,
      contains("Minimum transfer amount is GH₵1.00"),
    );
    expect(source, contains('<\n                            1.00'));
  });

  test('minimum is scoped to the Merchant E-Cash workspace', () {
    expect(
      source,
      contains('_isTelecelMerchantECashWorkspace &&'),
    );
  });
}
