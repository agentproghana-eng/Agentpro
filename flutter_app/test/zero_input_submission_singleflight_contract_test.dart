import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('business and personal screens serialize local submission entry', () {
    for (final entry in {
      'transaction_screen.dart': '_proceed',
      'personal_transaction_screen.dart': '_submit',
    }.entries) {
      final source = File('lib/features/transactions/${entry.key}')
          .readAsStringSync();
      expect(source, contains('bool _zeroInputSubmissionInFlight = false;'));
      expect(source, contains('if (zeroInput && _zeroInputSubmissionInFlight) return;'));
      expect(source, contains('await ${entry.value}Internal(reservationToken: reservationToken);'));
      expect(source, contains('if (zeroInput) _zeroInputSubmissionInFlight = false;'));
    }
  });
}
