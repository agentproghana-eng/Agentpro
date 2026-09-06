import 'dart:io';

import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_draft_validation.dart';
import 'package:flutter_test/flutter_test.dart';

String readSource(String path) =>
    File(path).readAsStringSync();

String slice(
  String source,
  String startMarker,
  String endMarker,
) {
  final start = source.indexOf(startMarker);
  final end = source.indexOf(
    endMarker,
    start < 0 ? 0 : start + 1,
  );

  expect(start, greaterThanOrEqualTo(0));
  expect(end, greaterThan(start));

  return source.substring(start, end);
}

void main() {
  final screen = readSource(
    'lib/features/transactions/'
    'personal_transaction_screen.dart',
  );

  final progress = readSource(
    'lib/features/transactions/'
    'transaction_progress_screen.dart',
  );

  final ussd = readSource(
    'lib/core/services/ussd_service.dart',
  );

  final editor = readSource(
    'lib/features/ussd_flows/'
    'ussd_flow_editor_screen.dart',
  );

  final labels = readSource(
    'lib/shared/utils/transaction_labels.dart',
  );

  final channel = readSource(
    'android/app/src/main/kotlin/'
    'com/agentpro/ghana/'
    'UssdAccessibilityChannel.kt',
  );

  final service = readSource(
    'android/app/src/main/kotlin/'
    'com/agentpro/ghana/'
    'UssdAccessibilityService.kt',
  );

  group('Telecel Personal Send Money to Bank', () {
    test('shows exactly the four transaction inputs in order', () {
      final form = screen.indexOf(
        'Widget _buildGenericForm',
      );

      final bank = screen.indexOf(
        "labelText: 'Bank Name'",
        form,
      );

      final account = screen.indexOf(
        "label: 'Account Number'",
        bank,
      );

      final amount = screen.indexOf(
        "label: 'Amount (GHS)'",
        account,
      );

      final reference = screen.indexOf(
        "_referenceRequired ? 'Reference'",
        amount,
      );

      expect(form, greaterThanOrEqualTo(0));
      expect(bank, greaterThan(form));
      expect(account, greaterThan(bank));
      expect(amount, greaterThan(account));
      expect(reference, greaterThan(amount));

      expect(
        screen,
        contains(
          "if (_isTelecelBankTransfer) {\n"
          "      return false;",
        ),
      );
    });

    test('keeps bank menu routing hidden from the user', () {
      expect(
        screen,
        contains(
          "static const Map<String, List<String>> "
          "_telecelBankSelections",
        ),
      );

      expect(
        screen,
        contains(
          "'GT Bank': ['3', '2']",
        ),
      );

      expect(
        screen,
        contains(
          "'selections_in_order': selectionsInOrder",
        ),
      );

      expect(
        screen,
        contains(
          "'bank_name': bankName",
        ),
      );

      expect(
        screen,
        contains(
          "'account_number': accountNumber",
        ),
      );
    });

    test('bank transfer cannot persist account number in offline queue', () {
      final offlineDecision = screen.indexOf(
        "transactionType == 'send_money_to_bank'",
      );

      final offlineStore = screen.indexOf(
        'OfflineQueueService.init()',
        offlineDecision,
      );

      expect(
        offlineDecision,
        greaterThanOrEqualTo(0),
      );

      expect(
        offlineStore,
        greaterThan(offlineDecision),
      );

      expect(
        screen,
        contains(
          'bank account number is not stored in AgentPro offline data.',
        ),
      );
    });

    test('Flutter runtime passes transient account number to native', () {
      expect(
        ussd,
        contains('String? accountNumber,'),
      );

      expect(
        ussd,
        contains(
          "if (accountNumber != null) "
          "'account_number': accountNumber",
        ),
      );

      expect(
        progress,
        contains(
          "accountNumber: "
          "automationParams['account_number']",
        ),
      );
    });

    test('invalid account input is a definite pre-dispatch failure', () {
      expect(
        ussd,
        contains("'INVALID_ACCOUNT_NUMBER',"),
      );

      expect(
        ussd,
        contains(
          "'This USSD flow requires a valid bank account number.'",
        ),
      );
    });

    test('native channel validates account number before dialing', () {
      expect(
        channel,
        contains(
          'call.argument<String>("account_number")',
        ),
      );

      expect(
        channel,
        contains(
          'steps.any { it.action == '
          '"send_account_number" }',
        ),
      );

      expect(
        channel,
        contains(
          '"INVALID_ACCOUNT_NUMBER"',
        ),
      );

      expect(
        channel,
        contains(
          'accountNumber,\n'
          '            steps,',
        ),
      );
    });

    test('native service sends and then wipes account number', () {
      expect(
        service,
        contains(
          '@Volatile var pendingAccountNumber: '
          'String? = null',
        ),
      );

      expect(
        service,
        contains(
          'pendingAccountNumber = accountNumber',
        ),
      );

      expect(
        service,
        contains(
          '"send_account_number" ->',
        ),
      );

      expect(
        service,
        contains(
          'pendingAccountNumber?.let { '
          'respond(root, it) } ?: false',
        ),
      );

      expect(
        service,
        contains(
          'pendingAccountNumber = null',
        ),
      );
    });

    test('PIN remains an irreversible native write boundary', () {
      expect(
        service,
        contains(
          'reachedPinPrompt -> '
          'handleAfterPinPrompt(screenText)',
        ),
      );

      final postPin = slice(
        service,
        'private fun handleAfterPinPrompt(',
        'private fun normalizeUssdText',
      );

      expect(
        postPin,
        isNot(contains('AccessibilityNodeInfo')),
      );

      expect(
        postPin,
        isNot(contains('respond(')),
      );

      expect(
        postPin,
        isNot(contains('performAction')),
      );
    });

    test('Flow Builder recognizes dedicated account-number action', () {
      expect(
        kValidUssdFlowActions,
        contains('send_account_number'),
      );

      expect(
        editor,
        contains(
          "{'value': 'send_account_number', "
          "'label': 'Send Account Number'}",
        ),
      );

      final validation = validateUssdFlowDraftSteps([
        {
          'match_all': ['enter account number'],
          'action': 'send_account_number',
          'action_value': null,
        },
        {
          'match_all': ['enter pin'],
          'action': 'pin_prompt',
          'action_value': null,
        },
      ]);

      expect(validation, isNull);
    });

    test('uses the intended transaction label', () {
      expect(
        labels,
        contains(
          "case 'send_money_to_bank':",
        ),
      );

      expect(
        labels,
        contains(
          "return 'Send Money to Bank';",
        ),
      );
    });
  });
}
