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
    expect(service, contains('"invalid mobile number"'));
    expect(service, contains('"incorrect mobile number"'));
    expect(service, contains('"number not valid"'));
    expect(service, contains('"not allowed to access this code"'));
    expect(
      service,
      contains(
        '(COMMON_FAILURE_MARKERS + failureMarkers.orEmpty())',
      ),
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
      contains('Timer(const Duration(seconds: 10)'),
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
      personal,
      contains("RegExp(r'^\\d{10}\$')"),
    );
    expect(
      personal,
      isNot(contains('length < 9')),
    );
  });
}
