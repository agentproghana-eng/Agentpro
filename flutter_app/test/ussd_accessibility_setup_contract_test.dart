import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('USSD Accessibility setup contract', () {
    final disclosure = File(
      'lib/shared/widgets/ussd_accessibility_disclosure.dart',
    ).readAsStringSync();

    final progress = File(
      'lib/features/transactions/transaction_progress_screen.dart',
    ).readAsStringSync();

    final service = File(
      'lib/core/services/ussd_service.dart',
    ).readAsStringSync();

    final androidChannel = File(
      'android/app/src/main/kotlin/com/agentpro/ghana/'
      'UssdAccessibilityChannel.kt',
    ).readAsStringSync();

    test('prominent disclosure is concise and preserves PIN privacy', () {
      expect(
        disclosure,
        contains(
          'AgentPro uses Android Accessibility only for USSD',
        ),
      );

      expect(
        disclosure,
        contains(
          'Mobile Money PIN is never read, stored, or entered by',
        ),
      );

      final disclosureSource = disclosure.replaceAll(
        RegExp(r"'\s*'"),
        '',
      );

      expect(
        disclosureSource,
        contains(
          'processed only on this device',
        ),
      );

      expect(
        disclosure,
        isNot(contains('What it accesses:')),
      );

      expect(
        disclosure,
        isNot(contains('How it is used:')),
      );
    });

    test('restricted setting guidance never claims to bypass Android', () {
      expect(
        progress,
        contains('Accessibility is still off'),
      );

      expect(
        progress,
        contains('Allow restricted settings'),
      );

      expect(
        progress,
        contains(
          'AgentPro cannot change this Android security setting for you.',
        ),
      );

      expect(
        progress,
        contains('Open AgentPro App Info'),
      );
    });

    test('settings round trip rechecks Accessibility and continues', () {
      expect(
        progress,
        contains('_waitForAndroidSettingsRoundTrip'),
      );

      expect(
        progress,
        contains('accessEngine.openAppSettings'),
      );

      expect(
        progress,
        contains('accessEngine.isServiceEnabled()'),
      );

      expect(
        progress,
        contains(
          'Continue this same transaction',
        ),
      );

      expect(
        progress,
        isNot(
          contains(
            'then return to AgentPro and start the transaction again',
          ),
        ),
      );
    });

    test('Flutter and Android expose only user-controlled App Info', () {
      expect(
        service,
        contains("invokeMethod('openAppSettings')"),
      );

      expect(
        androidChannel,
        contains('"openAppSettings"'),
      );

      expect(
        androidChannel,
        contains(
          'Settings.ACTION_APPLICATION_DETAILS_SETTINGS',
        ),
      );

      expect(
        androidChannel,
        contains(
          'Uri.parse("package:\${context.packageName}")',
        ),
      );

      expect(
        androidChannel,
        isNot(contains('WRITE_SECURE_SETTINGS')),
      );
    });
  });
}
