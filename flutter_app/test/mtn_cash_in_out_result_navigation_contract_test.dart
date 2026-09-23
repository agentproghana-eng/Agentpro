import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  group('MTN Cash In/Out result navigation', () {
    late String handler;

    setUpAll(() {
      final start = screen.indexOf(
        'Future<void> _handleProgressAction(String? action) async',
      );

      final end = screen.indexOf(
        'Future<void> _proceed() async',
        start,
      );

      expect(start, greaterThan(-1));
      expect(end, greaterThan(start));

      handler = screen.substring(start, end);
    });

    test('both progress paths use the centralized result policy', () {
      expect(
        RegExp(
          r'await _handleProgressAction\(progressAction\);',
        ).allMatches(screen).length,
        2,
      );

      expect(
        screen,
        isNot(
          contains(
            "if (mounted && progressAction == 'success')",
          ),
        ),
      );
    });

    test('Retry Now immediately retries the transaction', () {
      expect(
        handler,
        contains("if (action == 'retry_now')"),
      );

      expect(
        handler,
        contains('await _proceed();'),
      );
    });

    test('workspace success clears completed transaction', () {
      final workspaceStart = handler.indexOf(
        'if (_isMtnCashInOutWorkspace ||',
      );

      final ordinaryStart = handler.indexOf(
        '// Ordinary business transactions',
      );

      expect(workspaceStart, greaterThan(-1));
      expect(ordinaryStart, greaterThan(workspaceStart));

      final workspace = handler.substring(
        workspaceStart,
        ordinaryStart,
      );

      expect(
        workspace,
        contains("if (action == 'success')"),
      );

      expect(
        workspace,
        contains('_clearTransactionInputsAfterSuccess();'),
      );

      expect(
        workspace,
        isNot(contains("action == 'cancelled'")),
      );

      expect(
        workspace,
        isNot(contains("action == 'failed'")),
      );

      expect(
        workspace,
        isNot(contains("action == 'pending_confirmation'")),
      );

      expect(
        workspace,
        isNot(contains("context.go('/agent')")),
      );
    });

    test('ordinary success and cancellation return Home', () {
      final ordinaryStart = handler.indexOf(
        '// Ordinary business transactions',
      );

      final ordinary = handler.substring(ordinaryStart);

      expect(
        ordinary,
        contains("if (action == 'success')"),
      );

      expect(
        ordinary,
        contains("if (action == 'cancelled')"),
      );

      expect(
        RegExp(
          r"context\.go\('/agent'\)",
        ).allMatches(ordinary).length,
        2,
      );
    });

    test('failure and pending are not converted to cancellation', () {
      expect(
        handler,
        isNot(contains("if (action == 'failed')")),
      );

      expect(
        handler,
        isNot(
          contains("if (action == 'pending_confirmation')"),
        ),
      );
    });

    test('no fake Cash In/Out backend transaction type exists', () {
      expect(screen, isNot(contains("'cash_in_out'")));

      expect(
        screen,
        contains(
          "_transactionType == 'send_money' && "
          "_selectedProvider == 'mtn'",
        ),
      );
    });
  });
}
