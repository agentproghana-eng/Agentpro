import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('USSD fast failure, cancel and phone validation contracts', () {
    final service = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityService.kt',
    ).readAsStringSync();

    final channel = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityChannel.kt',
    ).readAsStringSync();

    final ussd = File(
      'lib/core/services/ussd_service.dart',
    ).readAsStringSync();

    final progress = File(
      'lib/features/transactions/transaction_progress_screen.dart',
    ).readAsStringSync();

    final transaction = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    final personal = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();

    final accessibilityConfig = File(
      'android/app/src/main/res/xml/'
      'ussd_accessibility_service_config.xml',
    ).readAsStringSync();

    expect(service, contains('COMMON_FAILURE_MARKERS'));
    expect(service, contains('PROVIDER_FAILURE_MARKERS'));
    expect(service, contains('COMMON_TERMINAL_SUCCESS_MARKERS'));
    expect(service, contains('PROVIDER_TERMINAL_SUCCESS_MARKERS'));
    expect(service, contains('"telecel" to listOf('));
    expect(service, contains('"confirmed. ghs"'));
    expect(
      service,
      contains('PROVIDER_TERMINAL_SUCCESS_PROMOTION_MARKERS'),
    );
    expect(
      service,
      contains('"confirmed"'),
    );
    expect(service, contains('"invalid mobile number"'));
    expect(service, contains('"incorrect mobile number"'));
    expect(service, contains('"number not valid"'));
    expect(service, contains('"not allowed to access this code"'));
    expect(
      service,
      contains('providerFailureMarkers(provider)'),
    );
    expect(
      service,
      contains('providerTerminalSuccessMarkers(provider)'),
    );
    expect(
      service,
      contains('pendingTerminalSuccessMarkers'),
    );
    expect(
      service,
      contains('terminalSuccessMarkers'),
    );
    expect(
      service,
      contains('filterNot {'),
    );
    expect(
      service,
      contains('it in terminalSuccessPromotionMarkers'),
    );
    expect(
      service,
      contains('if (reachedPinPrompt)'),
    );

    expect(
      service,
      contains('AccessibilityEvent.TYPE_VIEW_CLICKED'),
    );
    expect(
      accessibilityConfig,
      contains('typeViewClicked'),
    );
    expect(service, contains('"cancelled"'));
    expect(
      service,
      contains('Transaction cancelled by user at PIN prompt'),
    );

    expect(
      ussd,
      contains('Timer(const Duration(seconds: 45)'),
    );
    // Ten seconds is permitted only for the deliberately bounded
    // MTN Cash Out window after the amount has been submitted and while
    // AgentPro is waiting for the agent PIN prompt. Generic USSD failure
    // handling must not use this short timeout.
    expect(
      ussd,
      contains("case 'onWaitingForPinPrompt':"),
    );
    expect(
      ussd,
      contains('Timer(const Duration(seconds: 10)'),
    );
    expect(
      ussd,
      contains('_waitingForMtnCashOutPinPrompt'),
    );
    expect(
      ussd,
      contains(
        'MTN Cash Out PIN prompt was not received within 10 seconds.',
      ),
    );
    expect(
      ussd,
      isNot(contains('Timer(const Duration(seconds: 20)')),
    );
    expect(
      ussd,
      contains("'cancelled' => USSDStatus.cancelled"),
    );

    expect(
      progress,
      contains('result.outcome == USSDStatus.cancelled'),
    );
    expect(
      progress,
      contains("Navigator.of(context).pop('cancelled')"),
    );
    expect(
      progress,
      contains("context.pop('success')"),
    );
    expect(
      progress,
      contains('processingPhone'),
    );
    expect(
      progress,
      contains("RegExp(r'^\\d{10}\$').hasMatch(value)"),
    );

    expect(
      channel,
      contains('Regex("^\\\\d{10}\$")'),
    );
    expect(
      channel,
      contains('Enter a valid 10-digit mobile number'),
    );

    expect(
      transaction,
      contains("RegExp(r'^\\d{10}\$')"),
    );
    expect(
      transaction,
      contains('_clearTransactionInputsAfterSuccess'),
    );
    expect(
      transaction,
      contains('_selectedTelecelBundle = null'),
    );
    expect(
      transaction,
      contains('_feeAutoCalculated = true'),
    );
    expect(
      transaction,
      contains('Duration(milliseconds: 50)'),
    );

    expect(
      personal,
      contains("RegExp(r'^\\d{10}\$')"),
    );
    expect(
      personal,
      contains('_clearTransactionInputsAfterSuccess'),
    );
    expect(
      personal,
      contains('_crossNetworkSelection = null'),
    );
    expect(
      personal,
      contains('_bundleCategory = null'),
    );
    expect(
      personal,
      contains('_mashupTier = null'),
    );
    expect(
      personal,
      contains('_applyInitialQuickActionPreset()'),
    );
    expect(
      personal,
      isNot(contains('length < 9')),
    );
  });
}
