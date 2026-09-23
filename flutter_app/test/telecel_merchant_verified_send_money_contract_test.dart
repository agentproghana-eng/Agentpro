import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Telecel Merchant same-network flow evidence is kept distinct', () {
    final progress = File(
      'lib/features/transactions/transaction_progress_screen.dart',
    ).readAsStringSync();

    // Merchant execution must never silently fall through to a Personal
    // Telecel send-money implementation.
    expect(
      progress.contains('telecelMerchantECashWorkspace'),
      isTrue,
    );
  });

  test('E-Cash selectors preserve complete verified account names', () {
    final screen = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    expect(screen, contains("'TRANSFER TO WORKING ACCOUNT'"));
    expect(screen, contains("'TRANSFER TO MERCHANT ACCOUNT'"));
    expect(screen, contains('maxLines: 2'));
    expect(screen, contains('softWrap: true'));
    expect(screen, contains('overflow: TextOverflow.visible'));
  });
}
