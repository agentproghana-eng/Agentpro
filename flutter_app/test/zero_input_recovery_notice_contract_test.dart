import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final filename in <String>[
    'transaction_screen.dart',
    'personal_transaction_screen.dart',
  ]) {
    test('$filename explains unresolved zero-input attempts', () {
      final source = File('lib/features/transactions/$filename').readAsStringSync();
      expect(source, contains('await ZeroInputRecoveryStatus.inspect()'));
      expect(source, contains('A previous balance enquiry may still be unresolved.'));
      expect(source, contains("'verification before another attempt. Contact support.'"));
    });
  }
}
