import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Telecel post-PIN provider activity resets inactivity timeout', () {
    final source =
        File('lib/core/services/ussd_service.dart').readAsStringSync();

    expect(source, contains("case 'onPostPinProviderActivity':"));
    expect(source, contains('_armPostPinInactivityTimeout();'));
    expect(source, contains("_activeProvider == 'telecel'"));
    expect(
      source,
      contains('Timer(const Duration(seconds: 45)'),
    );
  });

  test('native post-PIN Telecel path remains observation-only', () {
    final service = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityService.kt',
    ).readAsStringSync();

    final channel = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityChannel.kt',
    ).readAsStringSync();

    expect(
      service,
      contains('fun onPostPinProviderActivity()'),
    );
    expect(
      service,
      contains('listener?.onPostPinProviderActivity()'),
    );

    expect(
      service,
      contains(
        'lastPostPinProviderActivityScreenHash:',
      ),
    );
    expect(
      service,
      contains(
        'val screenHash = hashUssdScreen(screenText)',
      ),
    );
    expect(
      service,
      contains(
        'screenHash != lastPostPinProviderActivityScreenHash',
      ),
    );
    expect(
      service,
      contains(
        'lastPostPinProviderActivityScreenHash = screenHash',
      ),
    );

    // Declaration initialization + startSession reset + endSession reset.
    expect(
      RegExp(
        r'lastPostPinProviderActivityScreenHash\s*[:=]',
      ).allMatches(service).length,
      greaterThanOrEqualTo(3),
    );
    expect(
      service,
      contains(
        'pendingProvider == "telecel" &&\n'
        '            pendingSteps != null',
      ),
    );

    expect(
      channel,
      contains(
        'channel.invokeMethod("onPostPinProviderActivity", null)',
      ),
    );
  });
}
