import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });


  const secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  Future<void> expectStorageExceptionBlocksInitiation(
    String failingMethod,
  ) async {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    FlutterSecureStorage.setMockInitialValues({});

    var injectedFailures = 0;

    messenger.setMockMethodCallHandler(
      secureStorageChannel,
      (call) async {
        if (call.method == failingMethod) {
          injectedFailures++;
          throw PlatformException(
            code: 'SIMULATED_STORAGE_FAILURE',
            message: 'Injected $failingMethod failure',
          );
        }
        return null;
      },
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
        reason: 'Secure-storage exception must actually be injected',
      );

      expect(
        ZeroInputExecutionSession.ownsReservation(token),
        isTrue,
      );

      expect(
        ZeroInputExecutionSession.reserveForInitiation(),
        isNull,
      );
    } finally {
      messenger.setMockMethodCallHandler(
        secureStorageChannel,
        null,
      );
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
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

}
