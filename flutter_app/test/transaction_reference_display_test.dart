import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/'
    'transaction_reference_display.dart';

void main() {
  group('compactTransactionReference', () {
    test('keeps the AgentPro suffix while hiding the timestamp', () {
      expect(
        compactTransactionReference(
          'APG-1787617389643-Z12J7B',
        ),
        'APG-Z12J7B',
      );
    });

    test('leaves short references unchanged', () {
      expect(
        compactTransactionReference('NET-12345'),
        'NET-12345',
      );
    });

    test('compacts an unknown long reference safely', () {
      expect(
        compactTransactionReference(
          'ABCDEF1234567890ZYXWVUTS',
        ),
        'ABCDEF…ZYXWVUTS',
      );
    });

    test('handles empty values', () {
      expect(compactTransactionReference(null), '');
      expect(compactTransactionReference(''), '');
    });
  });
}
