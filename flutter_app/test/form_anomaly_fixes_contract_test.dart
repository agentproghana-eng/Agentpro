import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  test('progress screen checks flow inputs before dialing', () {
    expect(progress, contains('missingUssdFlowInput'));
    expect(
      progress.indexOf('missingUssdFlowInput'),
      lessThan(progress.indexOf("if (executionMode == 'direct')")),
    );
  });

  test('transaction screen blocks offline protected-credential flows', () {
    expect(screen, contains('ussdFlowNeedsProtectedCredential'));
  });

  test('Telecel airtime Self variant is Merchant-only', () {
    expect(screen, contains("_selectedBusinessSimRole == 'merchant'"));
  });
}
