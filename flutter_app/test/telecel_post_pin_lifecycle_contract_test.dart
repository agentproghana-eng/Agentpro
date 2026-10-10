import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Telecel post-PIN provider activity resets inactivity timeout', () {
    final source =
        File('lib/core/services/ussd_service.dart').readAsStringSync();

    expect(source, contains("case 'onPostPinProviderActivity':"));
    expect(source, contains('_armPostPinInactivityTimeout();'));
    expect(
      source,
      contains('Timer(const Duration(seconds: 45)'),
    );
  });

  test('shared post-PIN heartbeat is available beyond Telecel', () {
    final flutterSource =
        File('lib/core/services/ussd_service.dart').readAsStringSync();
    final nativeSource = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityService.kt',
    ).readAsStringSync();

    final callback = flutterSource.split("case 'onPostPinProviderActivity':")[1]
        .split("case 'onResult':")[0];
    expect(callback, contains('_pinPromptReached'));
    expect(callback, contains('_armPostPinInactivityTimeout();'));
    expect(callback, isNot(contains("_activeProvider == 'telecel'")));

    final sharedObservation = nativeSource.split(
      '// Other providers use the same read-only post-PIN inactivity',
    )[1].split('// Data-driven step matching')[0];
    expect(sharedObservation, contains('!isPinPromptScreen(screenText)'));
    expect(sharedObservation, contains('screenHash != lastPostPinProviderActivityScreenHash'));
    expect(sharedObservation, contains('listener?.onPostPinProviderActivity()'));
    expect(sharedObservation, isNot(contains('respond(')));
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
