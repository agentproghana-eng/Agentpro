import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('personal recipient phone checks use a real digit pattern', () {
    final source = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();

    // A doubled backslash in a raw string matches a literal "\d", so no
    // 10-digit number could ever pass.
    expect(source, isNot(contains(r"r'^\\d{10}$'")));
    expect(RegExp(r"RegExp\(r'\^\\d\{10\}\$'\)").allMatches(source).length,
        greaterThanOrEqualTo(5));
  });
}
