import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_draft_validation.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> step(
  String action, {
  List<String> matchAll = const ['menu'],
  String? value,
}) {
  return {
    'match_all': matchAll,
    'action': action,
    if (value != null) 'action_value': value,
  };
}

void main() {
  metadataValidationTests();
  group('USSD Flow draft validation', () {
    test('accepts Direct USSD String without interactive steps', () {
      final result = validateUssdFlowDraftSteps(
        const [],
        executionMode: 'direct',
      );

      expect(result, isNull);
    });

    test('rejects interactive steps in Direct USSD String mode', () {
      final result = validateUssdFlowDraftSteps(
        [
          step('pin_prompt'),
        ],
        executionMode: 'direct',
      );

      expect(
        result,
        contains('must not contain interactive steps'),
      );
    });

    test('keeps empty Interactive Flow invalid', () {
      final result = validateUssdFlowDraftSteps(
        const [],
        executionMode: 'interactive',
      );

      expect(
        result,
        contains('At least one step is required'),
      );
    });

    test('rejects unknown execution mode', () {
      final result = validateUssdFlowDraftSteps(
        const [],
        executionMode: 'future_mode',
      );

      expect(
        result,
        contains('Execution mode must be'),
      );
    });

    test('accepts a safe flow ending at PIN', () {
      final result = validateUssdFlowDraftSteps([
        step('send_digit', value: '1'),
        step('send_customer_phone'),
        step('send_amount'),
        step('pin_prompt'),
      ]);

      expect(result, isNull);
    });

    test('accepts one numeric auto-confirm after PIN', () {
      final result = validateUssdFlowDraftSteps([
        step('send_digit', value: '1'),
        step('pin_prompt'),
        step('auto_confirm_once', value: '1'),
      ]);

      expect(result, isNull);
    });

    test('rejects empty screen matcher', () {
      final result = validateUssdFlowDraftSteps([
        step(
          'send_digit',
          matchAll: const [],
          value: '1',
        ),
        step('pin_prompt'),
      ]);

      expect(
        result,
        contains('screen match text cannot be empty'),
      );
    });

    test('rejects missing Send Digit value', () {
      final result = validateUssdFlowDraftSteps([
        step('send_digit'),
        step('pin_prompt'),
      ]);

      expect(
        result,
        contains('Send Digit requires a value'),
      );
    });

    test('requires exactly one PIN Prompt', () {
      final missing = validateUssdFlowDraftSteps([
        step('send_digit', value: '1'),
      ]);

      expect(
        missing,
        contains('exactly one PIN Prompt'),
      );

      final duplicate = validateUssdFlowDraftSteps([
        step('pin_prompt'),
        step('pin_prompt'),
      ]);

      expect(
        duplicate,
        contains('Only one PIN Prompt'),
      );
    });

    test('rejects ordinary automation after PIN', () {
      final result = validateUssdFlowDraftSteps([
        step('pin_prompt'),
        step('send_digit', value: '1'),
      ]);

      expect(
        result,
        contains('only Auto-Confirm Once may appear after'),
      );
    });

    test('rejects auto-confirm before PIN', () {
      final result = validateUssdFlowDraftSteps([
        step('auto_confirm_once', value: '1'),
        step('pin_prompt'),
      ]);

      expect(
        result,
        contains('must be placed after the PIN Prompt'),
      );
    });

    test('rejects non-numeric or multi-digit auto-confirm', () {
      final nonNumeric = validateUssdFlowDraftSteps([
        step('pin_prompt'),
        step('auto_confirm_once', value: 'Y'),
      ]);

      expect(
        nonNumeric,
        contains('exactly one numeric menu digit'),
      );

      final multiDigit = validateUssdFlowDraftSteps([
        step('pin_prompt'),
        step('auto_confirm_once', value: '11'),
      ]);

      expect(
        multiDigit,
        contains('exactly one numeric menu digit'),
      );
    });
  });
}

void metadataValidationTests() {
  group('USSD Flow metadata validation', () {
    test('accepts valid USSD dial code and markers', () {
      expect(
        validateUssdFlowDraftMetadata(
          dialCode: '*170#',
          successMarkers: const ['successful'],
          failureMarkers: const ['failed'],
        ),
        isNull,
      );
    });

    test('rejects unsafe dial strings', () {
      for (final dialCode in [
        'tel:*170#',
        '*170#,1',
        '*170;1#',
        '0240000000',
        '*170',
        '##',
      ]) {
        expect(
          validateUssdFlowDraftMetadata(
            dialCode: dialCode,
            successMarkers: const [],
            failureMarkers: const [],
          ),
          isNotNull,
          reason: dialCode,
        );
      }
    });

    test('rejects duplicate markers', () {
      expect(
        validateUssdFlowDraftMetadata(
          dialCode: '*170#',
          successMarkers: const [
            'successful',
            ' Successful ',
          ],
          failureMarkers: const [],
        ),
        contains('duplicate marker'),
      );
    });

    test('rejects success and failure overlap', () {
      expect(
        validateUssdFlowDraftMetadata(
          dialCode: '*170#',
          successMarkers: const ['transaction complete'],
          failureMarkers: const ['TRANSACTION COMPLETE'],
        ),
        contains(
          'cannot be both a success and failure marker',
        ),
      );
    });
  });
}
