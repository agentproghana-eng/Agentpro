import 'dart:io';

import 'package:agent_pro_ghana/core/services/ussd_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final source = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();

  test(
    'direct USSD execution contains no automatic redial after dispatch',
    () {
      final start = source.indexOf(
        'Future<USSDResult> execute() async {',
      );

      final end = source.indexOf(
        '/// Handles the PIN-prompt branch',
        start,
      );

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final execute = source.substring(start, end);

      expect(
        execute,
        isNot(contains('maxAttempts')),
      );

      expect(
        execute,
        isNot(contains("'retry'")),
      );

      expect(
        execute,
        isNot(contains('continue;')),
      );

      expect(
        RegExp(r'_dialUSSD\(resolvedCode\)').allMatches(execute).length,
        1,
      );

      expect(
        execute,
        contains(
          'outcome: USSDStatus.pendingConfirmation',
        ),
      );
    },
  );

  test(
    'unknown Accessibility startup failure is ambiguous',
    () async {
      const channel = MethodChannel(
        'com.agentpro.ghana/ussd_accessibility',
      );

      final calls = <MethodCall>[];

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        channel,
        (call) async {
          calls.add(call);

          if (call.method == 'startAutomation') {
            throw PlatformException(
              code: 'CHANNEL_REPLY_LOST',
              message: 'mock ambiguous platform failure',
            );
          }

          if (call.method == 'cancelAutomation') {
            return true;
          }

          return null;
        },
      );

      final engine = UssdAccessibilityEngine();

      try {
        final result = await engine.execute(
          customerPhone: '0241234567',
          amount: '10',
          transactionType: 'cash_in',
          provider: 'mtn',
          simSlot: 0,
        );

        expect(
          result.outcome,
          USSDStatus.pendingConfirmation,
        );

        expect(
          calls
              .where(
                (call) => call.method == 'startAutomation',
              )
              .length,
          1,
        );
      } finally {
        engine.dispose();

        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(
          channel,
          null,
        );
      }
    },
  );

  test(
    'known Accessibility SIM failure remains definite',
    () async {
      const channel = MethodChannel(
        'com.agentpro.ghana/ussd_accessibility',
      );

      final calls = <MethodCall>[];

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        channel,
        (call) async {
          calls.add(call);

          if (call.method == 'startAutomation') {
            throw PlatformException(
              code: 'SIM_UNAVAILABLE',
              message: 'mock exact-SIM failure',
            );
          }

          if (call.method == 'cancelAutomation') {
            return true;
          }

          return null;
        },
      );

      final engine = UssdAccessibilityEngine();

      try {
        final result = await engine.execute(
          customerPhone: '0241234567',
          amount: '10',
          transactionType: 'cash_in',
          provider: 'mtn',
          simSlot: 0,
        );

        expect(
          result.outcome,
          USSDStatus.failed,
        );

        expect(
          calls
              .where(
                (call) => call.method == 'startAutomation',
              )
              .length,
          1,
        );
      } finally {
        engine.dispose();

        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(
          channel,
          null,
        );
      }
    },
  );

  test(
    'Accessibility timeout starts after native dispatch and is pending',
    () {
      final accessibilityClass = source.indexOf(
        'class UssdAccessibilityEngine',
      );

      final executeStart = source.indexOf(
        'Future<USSDResult> execute({',
        accessibilityClass,
      );

      final executeEnd = source.indexOf(
        'void dispose()',
        executeStart,
      );

      expect(accessibilityClass, greaterThanOrEqualTo(0));
      expect(executeStart, greaterThan(accessibilityClass));
      expect(executeEnd, greaterThan(executeStart));

      final execute = source.substring(executeStart, executeEnd);

      final nativeStart = execute.indexOf(
        "await _channel.invokeMethod('startAutomation'",
      );

      final timeout = execute.indexOf(
        '_prePinTimeout =',
      );

      expect(nativeStart, greaterThanOrEqualTo(0));
      expect(timeout, greaterThan(nativeStart));

      final timeoutSection = execute.substring(timeout);

      expect(
        timeoutSection,
        contains(
          'outcome: USSDStatus.pendingConfirmation',
        ),
      );

      expect(
        timeoutSection,
        isNot(
          contains(
            'No response received from the USSD session. '
            'Please check your network and try again.',
          ),
        ),
      );
    },
  );
}
