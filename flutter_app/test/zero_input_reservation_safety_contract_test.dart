import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('zero-input reservations use secure random tokens', () {
    final source = File(
      'lib/features/transactions/'
      'zero_input_execution_session.dart',
    ).readAsStringSync();

    expect(source, contains('Random.secure()'));
    expect(source, contains('List<int>.generate(16,'));
    expect(source, contains('_newReservationToken()'));
    expect(source, isNot(contains('_nextReservation')));
  });

  test('direct execution requires an owned reservation', () {
    final source = File(
      'lib/features/transactions/'
      'zero_input_execution_session.dart',
    ).readAsStringSync();

    final method = source
        .split('static bool tryBegin({')[1]
        .split('static void settleDefinitiveResult(')[0];

    expect(
      method,
      contains('if (!ownsReservation(reservationToken)) return false;'),
    );
    expect(method, isNot(contains('_gate.tryAcquire()')));
  });
}
