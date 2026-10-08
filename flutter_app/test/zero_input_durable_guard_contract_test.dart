import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both initiation paths persist and safely abandon durable guard', () {
    for (final name in ['transaction_screen.dart', 'personal_transaction_screen.dart']) {
      final source = File('lib/features/transactions/$name').readAsStringSync();
      expect(source, contains('await ZeroInputExecutionSession.persistBeforeInitiation('));
      expect(source, contains('await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation('));
    }
  });

  test('durable state blocks fresh attempts and settles only after reporting', () {
    final session = File('lib/features/transactions/zero_input_execution_session.dart').readAsStringSync();
    final progress = File('lib/features/transactions/transaction_progress_screen.dart').readAsStringSync();
    expect(session, contains('if (await _storage.read(key: _unresolvedKey) != null) return false;'));
    expect(session, contains('if (await _storage.read(key: _unresolvedKey) != token) return false;'));
    expect(progress, contains('await ZeroInputExecutionSession.clearDurableReservation(token)'));
  });
}
