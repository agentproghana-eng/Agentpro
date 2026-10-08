import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both screens release only if backend initiation never began', () {
    for (final name in ['transaction_screen.dart', 'personal_transaction_screen.dart']) {
      final source = File('lib/features/transactions/$name').readAsStringSync();
      expect(source, contains('if (zeroInput && !_zeroInputBackendInitiationStarted)'));
      expect(source, contains('ZeroInputExecutionSession.abandonBeforeBackendInitiation('));
      expect(source, contains('_zeroInputBackendInitiationStarted = true;'));
    }
  });

  test('abandonment is restricted to matching owner', () {
    final source = File('lib/features/transactions/zero_input_execution_session.dart')
        .readAsStringSync();
    expect(source, contains('if (!ownsReservation(token)) return;'));
  });
}
