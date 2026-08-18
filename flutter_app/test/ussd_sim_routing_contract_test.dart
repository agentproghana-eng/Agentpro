import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void _verifyFlutterFailureMapping() {
  final source = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();

  expect(source, contains('} on PlatformException catch (e) {'));
  expect(source, contains("'SIM_REQUIRED' =>"));
  expect(source, contains("'SIM_UNAVAILABLE' =>"));
  expect(source, contains("'PERMISSION_DENIED' =>"));
  expect(source, contains("'SERVICE_DISABLED' =>"));
}

void main() {
  test('Flutter preserves safe native SIM startup failure categories', () {
    _verifyFlutterFailureMapping();
  });

  final accessibility = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'UssdAccessibilityChannel.kt',
  ).readAsStringSync();

  final methodChannel = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'USSDMethodChannel.kt',
  ).readAsStringSync();

  test('Accessibility dialing never falls back to PhoneAccount list position',
      () {
    expect(
      accessibility,
      isNot(contains('handles.getOrNull(simSlot)')),
    );

    expect(
      accessibility,
      contains('it.id == targetSubId'),
    );
  });

  test('Accessibility automation resolves exact SIM before starting session',
      () {
    final automationStart = accessibility.indexOf(
      'private fun startAutomation',
    );

    final simResolution = accessibility.indexOf(
      'val phoneAccountHandle = try {',
      automationStart,
    );

    final sessionStart = accessibility.indexOf(
      'UssdAccessibilityService.startSession(',
      automationStart,
    );

    expect(automationStart, greaterThanOrEqualTo(0));
    expect(simResolution, greaterThan(automationStart));
    expect(sessionStart, greaterThan(simResolution));

    expect(
      accessibility,
      contains('"SIM_REQUIRED"'),
    );
    expect(
      accessibility,
      contains('"SIM_UNAVAILABLE"'),
    );
  });

  test('Accessibility call intent always carries exact PhoneAccountHandle', () {
    expect(
      accessibility,
      contains('TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE'),
    );

    expect(
      accessibility,
      isNot(
        contains(
          'phoneAccountHandleForSimSlot(simSlot)?.let',
        ),
      ),
    );
  });

  test('sendUssdRequest never substitutes Android default subscription', () {
    expect(
      methodChannel,
      isNot(contains('getDefaultSubscriptionId()')),
    );

    expect(
      methodChannel,
      contains(
        'getActiveSubscriptionInfoForSimSlotIndex(',
      ),
    );

    expect(
      methodChannel,
      contains('"SIM_REQUIRED"'),
    );
    expect(
      methodChannel,
      contains('"SIM_UNAVAILABLE"'),
    );
  });
}

// Native fail-closed errors must reach the user as safe categories rather
// than being collapsed into an unhelpful generic startup message.
