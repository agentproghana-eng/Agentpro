import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('checkpoint survives readback and prevents a duplicate', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isTrue,
      );

      expect(
        await ZeroInputExecutionSession.recordOperationCheckpoint(
          token: token,
          operationId: operationId,
          transactionType: 'balance_enquiry',
          isPersonal: false,
        ),
        isTrue,
      );

      final identity =
          await ZeroInputExecutionSession.readUnresolvedIdentity();

      expect(identity, isNotNull);
      expect(identity!['client_operation_id'], operationId);
      expect(identity['account_mode'], 'business');
      expect(identity.containsKey('transaction_id'), isFalse);

      expect(ZeroInputExecutionSession.reserveForInitiation(), isNull);
    } finally {
      await ZeroInputExecutionSession.clearDurableReservation(token);
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('backend identity preserves operation UUID', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isTrue,
      );

      expect(
        await ZeroInputExecutionSession.recordOperationCheckpoint(
          token: token,
          operationId: operationId,
          transactionType: 'check_momo_balance',
          isPersonal: true,
        ),
        isTrue,
      );

      expect(
        await ZeroInputExecutionSession.recordBackendIdentity(
          token: token,
          transactionId: 'server-transaction-123',
          transactionType: 'check_momo_balance',
          isPersonal: true,
        ),
        isTrue,
      );

      final identity =
          await ZeroInputExecutionSession.readUnresolvedIdentity();

      expect(identity!['client_operation_id'], operationId);
      expect(identity['transaction_id'], 'server-transaction-123');
      expect(identity['account_mode'], 'personal');
    } finally {
      await ZeroInputExecutionSession.clearDurableReservation(token);
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('uncertain result cannot release the active lease', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isTrue,
      );

      ZeroInputExecutionSession.settleDefinitiveResult(
        resultDefinitive: false,
        reportPersisted: true,
        reservationToken: token,
      );

      expect(ZeroInputExecutionSession.isActive, isTrue);
      expect(ZeroInputExecutionSession.reserveForInitiation(), isNull);
    } finally {
      await ZeroInputExecutionSession.clearDurableReservation(token);
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });
}
