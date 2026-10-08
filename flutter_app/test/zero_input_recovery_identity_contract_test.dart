import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('backend identity is recorded before provider execution', () {
    final progress = File('lib/features/transactions/transaction_progress_screen.dart').readAsStringSync();
    expect(progress, contains('await ZeroInputExecutionSession.recordBackendIdentity('));
    expect(progress, contains('transactionId: transactionId,'));
    expect(progress, contains('isPersonal: widget.isPersonal,'));
  });

  test('recovery identity requires an owned persisted lock', () {
    final session = File('lib/features/transactions/zero_input_execution_session.dart').readAsStringSync();
    expect(session, contains('if (await _storage.read(key: _unresolvedKey) != token) return false;'));
    expect(session, contains("'account_mode': isPersonal ? 'personal' : 'business'"));
    expect(session, contains('await _storage.delete(key: _identityKey);'));
  });
}
