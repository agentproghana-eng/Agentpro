import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  Future<bool> persistOnce() async {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);
    final saved =
        await ZeroInputExecutionSession.persistBeforeInitiation(token);
    if (saved) {
      await ZeroInputExecutionSession.abandonDurableBeforeBackendInitiation(
        token,
      );
    } else {
      ZeroInputExecutionSession.abandonBeforeBackendInitiation(token);
    }
    return saved;
  }

  test('a reservation without an identity is cleared once', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'zero_input_orphan',
    });

    expect(await persistOnce(), isFalse);
    await ZeroInputExecutionSession.clearPreUnificationOrphanOnce();
    expect(await persistOnce(), isTrue);
  });

  test('a reservation with an identity is never cleared', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_unresolved_v1': 'zero_input_real',
      'zero_input_recovery_identity_v1':
          '{"reservation_token":"zero_input_real"}',
    });

    await ZeroInputExecutionSession.clearPreUnificationOrphanOnce();
    expect(await persistOnce(), isFalse);
  });

  test('after the first run later orphans keep blocking', () async {
    FlutterSecureStorage.setMockInitialValues({
      'zero_input_storage_unified_v1': 'done',
      'zero_input_unresolved_v1': 'zero_input_later',
    });

    await ZeroInputExecutionSession.clearPreUnificationOrphanOnce();
    expect(await persistOnce(), isFalse);
  });
}
