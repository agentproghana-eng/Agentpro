import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('initiating screens accept their own reservation, not any active lease', () {
    for (final name in ['transaction_screen.dart', 'personal_transaction_screen.dart']) {
      final source = File('lib/features/transactions/$name').readAsStringSync();
      expect(source, contains('!ZeroInputExecutionSession.ownsReservation(reservationToken)'));
      expect(source, isNot(contains('ZeroInputExecutionSession.isActive) {')));
    }
  });


  test('reservation token is forwarded to progress and settlement', () {
    for (final name in ['transaction_screen.dart', 'personal_transaction_screen.dart']) {
      final source = File('lib/features/transactions/$name').readAsStringSync();
      expect(source, contains('ZeroInputExecutionSession.reserveForInitiation()'));
      expect(source, contains("'zero_input_reservation_token':"));
    }
    final progress = File('lib/features/transactions/transaction_progress_screen.dart').readAsStringSync();
    expect(
      "reservationToken: widget.data['zero_input_reservation_token'] as String?"
          .allMatches(progress)
          .length,
      2,
    );
  });
}
