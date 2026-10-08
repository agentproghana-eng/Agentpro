import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('read-only reconciliation cannot release or redial', () {
    final source = File('lib/features/transactions/zero_input_recovery_status.dart').readAsStringSync();
    expect(source, contains('ZeroInputExecutionSession.readUnresolvedIdentity()'));
    expect(source, contains("'/personal-transactions/\$id'"));
    expect(source, contains("'/transactions/\$id'"));
    expect(source, isNot(contains('clearDurableReservation(')));
    expect(source, isNot(contains('settleDefinitiveResult(')));
    expect(source, isNot(contains('USSDEngine(')));
  });
  test('durable identity must match authoritative lock', () {
    final source = File('lib/features/transactions/zero_input_execution_session.dart').readAsStringSync();
    expect(source, contains('if (owner != token || id is! String'));
    expect(source, contains('static Future<Map<String, String>?> readUnresolvedIdentity()'));
  });
}
