import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both submission paths check for an active session', () {
    for (final name in [
      'transaction_screen.dart',
      'personal_transaction_screen.dart',
    ]) {
      final source = File('lib/features/transactions/$name').readAsStringSync();
      expect(source, contains('ZeroInputExecutionSession.isActive'));
    }
  });

  test('server acknowledgement precedes session settlement', () {
    final source = File(
      'lib/features/transactions/transaction_progress_screen.dart',
    ).readAsStringSync();
    final patch = source.indexOf('final res = await ApiClient.instance.patch(');
    final settle = source.indexOf('ZeroInputExecutionSession.settleDefinitiveResult(');
    expect(patch, greaterThanOrEqualTo(0));
    expect(settle, greaterThan(patch));
    expect(source.substring(settle, settle + 500),
        contains('reportPersisted: true'));
  });
}
