import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('recovery supports transaction ID and operation UUID', () {
    final source = File(
      'lib/features/transactions/zero_input_recovery_status.dart',
    ).readAsStringSync();

    expect(
      source,
      contains('ZeroInputExecutionSession.readUnresolvedIdentity()'),
    );
    expect(source, contains("identity['transaction_id']"));
    expect(source, contains("identity['client_operation_id']"));
    expect(source, contains("'\$prefix/\$id'"));
    expect(
      source,
      contains("'\$prefix/recovery/by-operation/\$operationId'"),
    );
  });

  test('recovery remains read-only and cannot release the lock', () {
    final source = File(
      'lib/features/transactions/zero_input_recovery_status.dart',
    ).readAsStringSync();

    expect(source, contains('ApiClient.instance.get(path)'));
    expect(source, isNot(contains('ApiClient.instance.post(')));
    expect(source, isNot(contains('clearDurableReservation(')));
    expect(source, isNot(contains('settleDefinitiveResult(')));
    expect(source, isNot(contains('USSDEngine(')));
    expect(source, contains("return 'unverified';"));
  });

  test('recovery identity requires the authoritative durable lock', () {
    final source = File(
      'lib/features/transactions/zero_input_execution_session.dart',
    ).readAsStringSync();

    expect(source, contains("decoded['reservation_token'] != token"));
    expect(
      source,
      contains('static Future<Map<String, String>?> readUnresolvedIdentity()'),
    );
    expect(source, contains('if (!hasId && !hasOperation) return null;'));
  });
}
