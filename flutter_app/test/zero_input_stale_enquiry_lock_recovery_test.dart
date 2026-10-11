import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const unresolved = 'zero_input_unresolved_v1';
  const identity = 'zero_input_recovery_identity_v1';
  const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

  String record(String type) => jsonEncode({
        'reservation_token': 'old-token',
        'client_operation_id': operationId,
        'transaction_type': type,
        'account_mode': 'business',
      });

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('clears a stale lock left by an earlier enquiry', () async {
    FlutterSecureStorage.setMockInitialValues({
      unresolved: 'old-token',
      identity: record('balance_enquiry'),
    });

    final token = ZeroInputExecutionSession.reserveForInitiation();
    try {
      expect(await ZeroInputExecutionSession.recoverStaleEnquiryLock(token),
          isTrue);
      expect(await ZeroInputExecutionSession.persistBeforeInitiation(token),
          isTrue);
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('clears a lock that never reached the backend', () async {
    FlutterSecureStorage.setMockInitialValues({unresolved: 'old-token'});

    final token = ZeroInputExecutionSession.reserveForInitiation();
    try {
      expect(await ZeroInputExecutionSession.recoverStaleEnquiryLock(token),
          isTrue);
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('keeps a record that is not a known enquiry', () async {
    FlutterSecureStorage.setMockInitialValues({
      unresolved: 'old-token',
      identity: record('cash_out'),
    });

    final token = ZeroInputExecutionSession.reserveForInitiation();
    try {
      expect(await ZeroInputExecutionSession.recoverStaleEnquiryLock(token),
          isFalse);
      expect(await ZeroInputExecutionSession.persistBeforeInitiation(token),
          isFalse);
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('does nothing without this process lease', () async {
    FlutterSecureStorage.setMockInitialValues({unresolved: 'old-token'});

    expect(await ZeroInputExecutionSession.recoverStaleEnquiryLock('other'),
        isFalse);
  });
}
