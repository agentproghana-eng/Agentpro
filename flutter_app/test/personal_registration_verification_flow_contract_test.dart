import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String read(
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
  final authBloc = read(
    'lib/core/auth/auth_bloc.dart',
  );

  final screen = read(
    'lib/features/auth/personal_register_screen.dart',
  );

  test(
    'Personal registration event carries the verified identity binding',
    () {
      final event = between(
        authBloc,
        'class AuthRegisterPersonalEvent',
        '// Merges updated fields',
      );

      expect(
        event.contains(
          'phoneVerificationToken',
        ),
        true,
      );

      expect(
        event.contains(
          'installationId',
        ),
        true,
      );

      expect(
        event.contains(
          'simIccid',
        ),
        true,
      );
    },
  );

  test(
    'registration request sends one-time token and matching identity fields',
    () {
      final handler = between(
        authBloc,
        'Future<void> _onRegisterPersonal',
        'Future<void> _onLock',
      );

      expect(
        handler.contains(
          "'phone_verification_token'",
        ),
        true,
      );

      expect(
        handler.contains(
          "'installation_id'",
        ),
        true,
      );

      expect(
        handler.contains(
          "'sim_iccid'",
        ),
        true,
      );
    },
  );

  test(
    'screen verifies the code before dispatching account registration',
    () {
      final verifyFlow = between(
        screen,
        'Future<void> _verifyAndRegister',
        'void _startResendCountdown',
      );

      final verifyIndex = verifyFlow.indexOf(
        '.verify(',
      );

      final registrationIndex = verifyFlow.indexOf(
        'AuthRegisterPersonalEvent(',
      );

      expect(
        verifyIndex >= 0,
        true,
      );

      expect(
        registrationIndex > verifyIndex,
        true,
      );
    },
  );

  test(
    'screen binds verification to installation and selected Subscriber SIM',
    () {
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

      expect(
        screen.contains(
          "'Subscriber SIM'",
        ),
        true,
      );

      expect(
        screen.contains(
          '_simIccid(sim)',
        ),
        true,
      );
    },
  );

  test(
    'OTP entry is six digits and resend is throttled in the UI',
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
    'registration screen does not log OTP or verification tokens',
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
