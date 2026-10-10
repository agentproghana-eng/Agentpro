import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });



  Future<void> expectStorageExceptionBlocksInitiation(
    String failingMethod,
  ) async {
    var injectedFailures = 0;

    FlutterSecureStoragePlatform.instance =
        _FailingSecureStoragePlatform(
      failingMethod: failingMethod,
      onFailure: () => injectedFailures++,
    );

    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isFalse,
      );

      expect(
        injectedFailures,
        greaterThan(0),
        reason: 'The storage exception must actually occur',
      );

      expect(ZeroInputExecutionSession.ownsReservation(token), isTrue);
      expect(ZeroInputExecutionSession.reserveForInitiation(), isNull);
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
      FlutterSecureStorage.setMockInitialValues({});
    }
  }

  test('storage read exception blocks initiation', () async {
    await expectStorageExceptionBlocksInitiation('read');
  });

  test('storage write exception blocks initiation', () async {
    await expectStorageExceptionBlocksInitiation('write');
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

  test('storage failure blocks initiation', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'existing-lock',
    });

    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isFalse,
      );

      expect(
        await ZeroInputExecutionSession.recordOperationCheckpoint(
          token: token,
          operationId: operationId,
          transactionType: 'balance_enquiry',
          isPersonal: false,
        ),
        isFalse,
      );
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('unreadable recovery identity fails closed', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'previous-lock',
      'zero_input_recovery_identity_v1': 'invalid-json',
    });

    expect(
      await ZeroInputExecutionSession.readUnresolvedIdentity(),
      isNull,
    );

    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isFalse,
      );
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('persisted operation survives loss of process lease', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

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

    // Simulate loss of the in-memory lease, not an Android process restart.
    ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);

    final identity =
        await ZeroInputExecutionSession.readUnresolvedIdentity();

    expect(identity, isNotNull);
    expect(identity!['client_operation_id'], operationId);

    final nextToken = ZeroInputExecutionSession.reserveForInitiation();
    expect(nextToken, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(nextToken),
        isFalse,
      );
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(nextToken);
    }
  });

  test('missing recovery identity does not bypass durable lock', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'orphaned-lock',
    });

    expect(
      await ZeroInputExecutionSession.readUnresolvedIdentity(),
      isNull,
    );

    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isFalse,
      );
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('orphaned identity blocks initiation without overwriting it', () async {
    const orphan = 'older-recovery-record';
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_recovery_identity_v1': orphan,
    });
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isFalse,
      );
      expect(
        ZeroInputExecutionSession.lastPreparationFailureCode,
        'orphaned_recovery_identity',
      );
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'zero_input_recovery_identity_v1'), orphan);
      expect(await storage.read(key: 'zero_input_unresolved_v1'), isNull);
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('foreign checkpoint cannot be erased by failed local preparation', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    try {
      expect(
        await ZeroInputExecutionSession.persistBeforeInitiation(token),
        isTrue,
      );
      const storage = FlutterSecureStorage();
      const foreign = '{"reservation_token":"foreign-lease"}';
      await storage.write(key: 'zero_input_recovery_identity_v1', value: foreign);
      expect(
        await ZeroInputExecutionSession.recordOperationCheckpoint(
          token: token,
          operationId: operationId,
          transactionType: 'balance_enquiry',
          isPersonal: false,
        ),
        isFalse,
      );
      expect(
        ZeroInputExecutionSession.lastPreparationFailureCode,
        'existing_recovery_identity',
      );
      await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation(token);
      expect(await storage.read(key: 'zero_input_recovery_identity_v1'), foreign);
      expect(await storage.read(key: 'zero_input_unresolved_v1'), token);
      expect(ZeroInputExecutionSession.ownsReservation(token), isTrue);
    } finally {
      // Test teardown only; simulated foreign identity is never deleted.
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

  test('owned pre-backend checkpoint abort cleans both durable keys', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    expect(await ZeroInputExecutionSession.persistBeforeInitiation(token), isTrue);
    expect(
      await ZeroInputExecutionSession.recordOperationCheckpoint(
        token: token,
        operationId: operationId,
        transactionType: 'cash_in_commission',
        isPersonal: false,
      ),
      isTrue,
    );
    await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation(token);
    const storage = FlutterSecureStorage();
    expect(await storage.read(key: 'zero_input_unresolved_v1'), isNull);
    expect(await storage.read(key: 'zero_input_recovery_identity_v1'), isNull);
    expect(ZeroInputExecutionSession.isActive, isFalse);
  });

  test('invalid operation UUID fails with privacy-safe reason', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    try {
      expect(await ZeroInputExecutionSession.persistBeforeInitiation(token), isTrue);
      expect(
        await ZeroInputExecutionSession.recordOperationCheckpoint(
          token: token,
          operationId: 'not-a-uuid',
          transactionType: 'commission_balance',
          isPersonal: false,
        ),
        isFalse,
      );
      expect(
        ZeroInputExecutionSession.lastPreparationFailureCode,
        'invalid_operation_id',
      );
    } finally {
      await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation(token);
    }
  });

  test('backend identity cannot bypass a missing UUID checkpoint', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    try {
      expect(await ZeroInputExecutionSession.persistBeforeInitiation(token), isTrue);
      expect(
        await ZeroInputExecutionSession.recordBackendIdentity(
          token: token,
          transactionId: 'server-id-123',
          transactionType: 'balance_enquiry',
          isPersonal: false,
        ),
        isFalse,
      );
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'zero_input_recovery_identity_v1'), isNull);
      expect(await storage.read(key: 'zero_input_unresolved_v1'), token);
    } finally {
      await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation(token);
    }
  });

  test('verified settlement clears owned checkpoint and releases the gate', () async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    expect(await ZeroInputExecutionSession.persistBeforeInitiation(token), isTrue);
    expect(
      await ZeroInputExecutionSession.recordOperationCheckpoint(
        token: token,
        operationId: operationId,
        transactionType: 'commission_balance',
        isPersonal: false,
      ),
      isTrue,
    );
    expect(await ZeroInputExecutionSession.clearDurableReservation(token), isTrue);
    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: true,
      reservationToken: token,
    );
    const storage = FlutterSecureStorage();
    expect(await storage.read(key: 'zero_input_unresolved_v1'), isNull);
    expect(await storage.read(key: 'zero_input_recovery_identity_v1'), isNull);
    expect(ZeroInputExecutionSession.isActive, isFalse);
  });

  test('unresolved durable lock is never cleared by another lease', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'previous-lease',
    });
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    try {
      expect(await ZeroInputExecutionSession.persistBeforeInitiation(token), isFalse);
      expect(ZeroInputExecutionSession.lastPreparationFailureCode,
          'unresolved_execution');
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'zero_input_unresolved_v1'),
          'previous-lease');
    } finally {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
  });

}

class _FailingSecureStoragePlatform extends FlutterSecureStoragePlatform {
  _FailingSecureStoragePlatform({
    required this.failingMethod,
    required this.onFailure,
  });

  final String failingMethod;
  final void Function() onFailure;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);

  @override
  Future<String?> read({
    required String key,
    required Map<String, String> options,
  }) async {
    if (failingMethod == 'read') {
      onFailure();
      throw StateError('Injected secure-storage read failure');
    }
    return null;
  }

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) async {
    if (failingMethod == 'write') {
      onFailure();
      throw StateError('Injected secure-storage write failure');
    }
  }
}
