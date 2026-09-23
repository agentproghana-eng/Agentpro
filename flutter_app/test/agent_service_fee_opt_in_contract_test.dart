import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  group('Agent Service Fee opt-in contract', () {
    test('service fee starts disabled', () {
      expect(
        source,
        contains('bool _agentServiceFeeEnabled = false;'),
      );
    });

    test('one percent is the automatic calculation when enabled', () {
      expect(
        source,
        contains('final fee = amount * 0.01;'),
      );

      expect(
        source,
        contains('_recalculateAgentServiceFee();'),
      );
    });

    test('fee field is enabled only after checkbox selection', () {
      expect(
        source,
        contains('value: _agentServiceFeeEnabled'),
      );

      expect(
        source,
        contains(
          'enabled: _agentServiceFeeEnabled && !_loading',
        ),
      );
    });

    test('manual fee replaces automatic calculation', () {
      expect(
        source,
        contains('bool _feeManuallyOverridden = false;'),
      );

      expect(
        source,
        contains('_feeManuallyOverridden = true;'),
      );

      expect(
        source,
        contains('_feeManuallyOverridden'),
      );

      expect(
        source,
        contains('_recalculateAgentServiceFee()'),
      );
    });

    test('unchecking service fee resets displayed value to zero', () {
      expect(
        source,
        contains("_feeCtrl.text = '0.00';"),
      );

      expect(
        source,
        contains(
          'void _setAgentServiceFeeEnabled(bool enabled)',
        ),
      );
    });

    test('offline and online payloads submit zero while disabled', () {
      expect(
        RegExp(
          r"'fee': _isAgentServiceFeeFlow && _agentServiceFeeEnabled",
        ).allMatches(source).length,
        2,
      );
    });

    test('successful transaction resets fee opt-in state', () {
      final reset = source.indexOf(
        'void _clearTransactionInputsAfterSuccess()',
      );

      expect(reset, greaterThanOrEqualTo(0));

      final resetSection = source.substring(
        reset,
        source.indexOf(
          'Future<void> _proceed()',
          reset,
        ),
      );

      expect(
        resetSection,
        contains('_agentServiceFeeEnabled = false;'),
      );

      expect(
        resetSection,
        contains('_feeManuallyOverridden = false;'),
      );

      expect(
        resetSection,
        contains("_feeCtrl.text = '0.00';"),
      );
    });

    test('legacy automatic fee state is removed', () {
      expect(
        source,
        isNot(contains('_feeAutoCalculated')),
      );
    });
  });
}
