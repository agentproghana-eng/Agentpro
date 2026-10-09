import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Business saves operation UUID before backend POST', () {
    final source = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    final checkpoint = source.indexOf('recordOperationCheckpoint(');
    final initiation = source.indexOf(
      'final transactionFuture = _initiateOnlineTransaction(',
    );

    expect(checkpoint, greaterThanOrEqualTo(0));
    expect(initiation, greaterThan(checkpoint));
    expect(source, contains('if (!saved)'));
    expect(source, contains('operationId: clientOperationId'));
  });

  test('Personal saves operation UUID before backend POST', () {
    final source = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();

    final checkpoint = source.indexOf('recordOperationCheckpoint(');
    final initiation = source.indexOf(
      'final response = await ApiClient.instance.post(',
    );

    expect(checkpoint, greaterThanOrEqualTo(0));
    expect(initiation, greaterThan(checkpoint));
    expect(source, contains('if (!saved)'));
    expect(
      source,
      contains("requestFields['client_operation_id']?.toString()"),
    );
  });

  test('Personal zero-input cannot enter offline transaction path', () {
    final source = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();

    final guard = source.indexOf(
      'if (isOffline && _activeZeroInputReservationToken != null)',
    );
    final offline = source.indexOf('if (isOffline) {');

    expect(guard, greaterThanOrEqualTo(0));
    expect(offline, greaterThan(guard));
    expect(
      source,
      contains('Automatic balance enquiry requires an internet connection.'),
    );
  });

  test('durable checkpoint requires verified storage readback', () {
    final source = File(
      'lib/features/transactions/zero_input_execution_session.dart',
    ).readAsStringSync();

    expect(source, contains('recordOperationCheckpoint({'));
    expect(
      source,
      contains('await _storage.read(key: _identityKey) == encoded'),
    );
    expect(
      source,
      contains('await _storage.read(key: _unresolvedKey) == token'),
    );
    expect(source, contains('ownsReservation(token)'));
  });

  test('recovery does not automatically retry or unlock', () {
    final source = File(
      'lib/features/transactions/zero_input_recovery_status.dart',
    ).readAsStringSync();

    expect(source, contains('ApiClient.instance.get(path)'));
    expect(source, isNot(contains('ApiClient.instance.post(')));
    expect(source, isNot(contains('clearDurableReservation(')));
    expect(source, isNot(contains('abandonDurableBeforeBackendInitiation(')));
  });
}
