import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File('lib/features/transactions/transaction_screen.dart')
      .readAsStringSync();

  group('Business submission re-entrancy', () {
    test('_proceed takes an owner-token gate before its first await', () {
      final start = source.indexOf('Future<void> _proceed() async {');
      final end = source.indexOf('Future<void> _proceedGated() async {', start);

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final wrapper = source.substring(start, end);

      expect(wrapper, contains('if (_submissionGateHeld) return;'));
      expect(
        wrapper,
        contains(
          'if (_workspaceEnquiryBusy && !_autoStartPreflightApproved) return;',
        ),
      );
      expect(wrapper, contains('_submissionGateOwner = gateOwner;'));
      expect(
        wrapper,
        contains('identical(_submissionGateOwner, gateOwner)'),
      );
      expect(
        wrapper.indexOf('_submissionGateOwner = gateOwner;'),
        lessThan(wrapper.indexOf('await ')),
      );
    });

    test('in-flight state covers loading, the gate and enquiry preflight', () {
      expect(
        source,
        contains(
          '_loading || _submissionGateHeld || _workspaceEnquiryBusy',
        ),
      );
    });

    test('gate is released before results are handled so Retry Now re-enters', () {
      expect(
        RegExp(
          r'_releaseSubmissionGate\(\);\s*'
          r'await _handleProgressAction\(progressAction\);',
        ).allMatches(source).length,
        2,
      );
    });

    test('workspace handlers re-check in-flight state before changing operation',
        () {
      for (final operation in [
        r"_mtnCashInOutOperation =\s*'send_money';",
        r"_mtnCashInOutOperation =\s*'cash_out';",
        r"_mtnPayToOperation = 'pay_to_agent';",
        r"_mtnPayToOperation = 'merchant_payment';",
      ]) {
        expect(
          RegExp(
            r'if \(_submissionInFlight\) return;\s*'
            r'setState\(\(\) \{\s*' +
                operation,
          ).hasMatch(source),
          isTrue,
          reason: 'Missing in-flight guard before: $operation',
        );
      }
    });

    test('enquiry entry point refuses to start while the gate is held', () {
      final handler = source
          .split('Future<void> _openMtnAgentCashEnquiry(')[1]
          .split('void _showPendingBalanceConfiguration(')[0];

      expect(handler, contains('_submissionGateHeld ||'));
    });
  });
}
