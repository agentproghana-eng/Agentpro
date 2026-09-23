import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  group('Business transaction result UX', () {
    test('amount remains prominently displayed', () {
      expect(
        progress,
        contains("'GH₵ \${parsedAmount.toStringAsFixed(2)}'"),
      );

      expect(
        progress,
        contains('fontSize: 30'),
      );
    });

    test('customer phone uses the same prominent font size', () {
      final phoneBlock = progress.indexOf(
        'SelectableText(\n                    customerPhone,',
      );

      expect(phoneBlock, greaterThanOrEqualTo(0));

      final block = progress.substring(
        phoneBlock,
        progress.indexOf(
          'const SizedBox(height: 8)',
          phoneBlock,
        ),
      );

      expect(block, contains('fontSize: 30'));
      expect(block, contains('fontWeight: FontWeight.w900'));
    });

    test('phone is not duplicated in generic result details', () {
      expect(
        progress,
        isNot(
          contains(
            "label: rawType == 'business_deposit'",
          ),
        ),
      );
    });

    test('references are visually secondary', () {
      expect(
        RegExp(r'valueFontSize: 11').allMatches(progress).length,
        greaterThanOrEqualTo(2),
      );

      expect(
        progress,
        contains("label: 'AgentPro Reference'"),
      );

      expect(
        progress,
        contains("label: 'Network Reference'"),
      );
    });

    test('provider cancellation remains distinct from failure', () {
      expect(
        progress,
        contains('result.outcome == USSDStatus.cancelled'),
      );

      expect(
        progress,
        contains("context.pop('cancelled')"),
      );

      expect(
        progress,
        contains("context.pop('failed')"),
      );

      expect(
        progress,
        contains("context.pop('pending_confirmation')"),
      );
    });
  });
}
