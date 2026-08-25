import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(
  String path,
) {
  return File(
    path,
  ).readAsStringSync();
}

String between(
  String source,
  String start,
  String end,
) {
  final startIndex = source.indexOf(
    start,
  );

  final endIndex = source.indexOf(
    end,
    startIndex + 1,
  );

  expect(
    startIndex >= 0,
    true,
  );

  expect(
    endIndex > startIndex,
    true,
  );

  return source.substring(
    startIndex,
    endIndex,
  );
}

void main() {
  final settings = readSource(
    'lib/features/settings/settings_screen.dart',
  );

  final screen = readSource(
    'lib/features/settings/add_personal_capability_screen.dart',
  );

  final router = readSource(
    'lib/core/router/app_router.dart',
  );

  test(
    'Settings no longer posts directly to the hardened capability endpoint',
    () {
      expect(
        settings.contains(
          '/auth/add-personal-capability',
        ),
        false,
      );

      expect(
        settings.contains(
          '/settings/add-personal-capability',
        ),
        true,
      );
    },
  );

  test(
    'capability screen verifies account phone before enabling Personal Mode',
    () {
      final flow = between(
        screen,
        'Future<void> _verifyAndEnable',
        'void _startResendCountdown',
      );

      final verificationIndex = flow.indexOf(
        '.verify(',
      );

      final capabilityIndex = flow.indexOf(
        '/auth/add-personal-capability',
      );

      expect(
        verificationIndex >= 0,
        true,
      );

      expect(
        capabilityIndex > verificationIndex,
        true,
      );
    },
  );

  test(
    'capability request carries one-time token installation and best-effort ICCID',
    () {
      expect(
        screen.contains(
          "'phone_verification_token'",
        ),
        true,
      );

      expect(
        screen.contains(
          "'installation_id'",
        ),
        true,
      );

      expect(
        screen.contains(
          "'sim_iccid'",
        ),
        true,
      );

      expect(
        screen.contains(
          'verified.verificationToken',
        ),
        true,
      );
    },
  );

  test(
    'capability flow uses the authenticated account phone',
    () {
      expect(
        screen.contains(
          "_currentUser()['phone']",
        ),
        true,
      );

      expect(
        screen.contains(
          'StorageService.getOrCreateInstallationId',
        ),
        true,
      );

      expect(
        screen.contains(
          'SimCardService.getSimCards',
        ),
        true,
      );

      expect(
        screen.contains(
          'sim.isMoMoSupported',
        ),
        true,
      );
    },
  );

  test(
    'capability OTP is six digits and has a resend countdown',
    () {
      expect(
        screen.contains(
          'FilteringTextInputFormatter.digitsOnly',
        ),
        true,
      );

      expect(
        screen.contains(
          'maxLength:',
        ),
        true,
      );

      expect(
        screen.contains(
          '_resendSeconds',
        ),
        true,
      );

      expect(
        screen.contains(
          'Timer.periodic',
        ),
        true,
      );
    },
  );

  test(
    'successful capability response updates cached Personal plan',
    () {
      expect(
        screen.contains(
          'AuthUpdateUserEvent',
        ),
        true,
      );

      expect(
        screen.contains(
          "'personal_subscription_plan'",
        ),
        true,
      );

      expect(
        screen.contains(
          "'personal_subscription_expires_at'",
        ),
        true,
      );
    },
  );

  test(
    'router exposes authenticated capability verification screen',
    () {
      expect(
        router.contains(
          "path: '/settings/add-personal-capability'",
        ),
        true,
      );

      expect(
        router.contains(
          'AddPersonalCapabilityScreen',
        ),
        true,
      );
    },
  );

  test(
    'capability verification does not log OTP or bearer tokens',
    () {
      expect(
        screen.contains(
          'print(',
        ),
        false,
      );

      expect(
        screen.contains(
          'debugPrint(',
        ),
        false,
      );
    },
  );
}
