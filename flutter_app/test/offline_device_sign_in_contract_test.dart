import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected source file to exist: $path',
  );

  return file.readAsStringSync();
}

String _slice(
  String source,
  String startMarker,
  String endMarker,
) {
  final start = source.indexOf(startMarker);

  expect(
    start,
    greaterThanOrEqualTo(0),
    reason: 'Missing start marker: $startMarker',
  );

  final end = source.indexOf(endMarker, start);

  expect(
    end,
    greaterThan(start),
    reason: 'Missing end marker: $endMarker',
  );

  return source.substring(start, end);
}

void main() {
  group('Offline device sign-in contracts', () {
    test(
      'device authentication is not gated by biometric enrollment',
      () {
        final source = _read(
          'lib/core/services/biometric_service.dart',
        );

        final availability = _slice(
          source,
          'static Future<BiometricAvailability> '
              'checkDeviceAuthAvailability() async {',
          'static Future<List<BiometricType>> getAvailableTypes() async {',
        );

        expect(
          availability,
          contains('_auth.isDeviceSupported()'),
        );

        expect(
          availability,
          isNot(contains('canCheckBiometrics')),
          reason:
              'PIN, pattern and device-password users must not be rejected by a biometrics-only capability gate.',
        );

        expect(
          availability,
          isNot(contains('getAvailableBiometrics')),
          reason:
              'Enrolled biometrics are display metadata, not an offline-unlock requirement.',
        );
      },
    );

    test(
      'phone PIN pattern and password fallback remain permitted',
      () {
        final source = _read(
          'lib/core/services/biometric_service.dart',
        );

        final auth = _slice(
          source,
          'static Future<BiometricResult> '
              'authenticateToUnlock() async {',
          'static Future<BiometricResult> enableDeviceAuthWithResult() async {',
        );

        expect(
          auth,
          contains('biometricOnly: false'),
          reason:
              'AgentPro offline unlock must allow the phone credential fallback.',
        );

        expect(
          auth,
          isNot(contains('ApiClient')),
          reason:
              'The phone-authentication challenge must remain completely local.',
        );
      },
    );

    test(
      'offline unlock requires a complete cached AgentPro session',
      () {
        final source = _read(
          'lib/features/auth/login_screen.dart',
        );

        final check = _slice(
          source,
          'Future<void> _checkDeviceAuth() async',
          'Future<void> _tryDeviceAuth() async',
        );

        expect(check, contains('StorageService.getUser()'));
        expect(check, contains('StorageService.getAccessToken()'));
        expect(check, contains('StorageService.getRefreshToken()'));

        expect(
          check,
          contains('BiometricService.isDeviceAuthEnabled()'),
        );
      },
    );

    test(
      'successful offline phone authentication performs local unlock only',
      () {
        final source = _read(
          'lib/features/auth/login_screen.dart',
        );

        final unlock = _slice(
          source,
          'Future<void> _tryDeviceAuth() async',
          'void _login()',
        );

        expect(
          unlock,
          contains('AuthUnlockEvent(approval)'),
        );

        expect(
          unlock,
          isNot(contains('ApiClient')),
        );

        expect(
          source,
          contains("'Unlock AgentPro'"),
        );

        expect(
          source,
          contains('No internet required'),
        );
      },
    );

    test(
      'inactivity preserves a local session only when device auth is enabled',
      () {
        final source = _read(
          'lib/core/auth/auth_bloc.dart',
        );

        final lock = _slice(
          source,
          'Future<void> _onLock(',
          'Future<void> _onUnlock(',
        );

        expect(
          lock,
          contains('BiometricService.isDeviceAuthEnabled()'),
        );

        expect(
          lock,
          contains('StorageService.setSessionLocked(true)'),
        );
      },
    );

    test(
      'settings exposes offline sign-in instead of biometrics-only wording',
      () {
        final source = _read(
          'lib/features/settings/settings_screen.dart',
        );

        expect(
          source,
          anyOf(
            contains("Text('Offline sign-in')"),
            contains("title: 'Offline sign-in'"),
          ),
        );

        expect(
          source,
          contains('checkDeviceAuthAvailability()'),
        );

        expect(
          source,
          contains(
            'BiometricService.enableDeviceAuthWithResult()',
          ),
        );

        expect(
          source,
          contains('without internet'),
        );
      },
    );

    test(
      'supported secure devices default offline sign-in on unless disabled',
      () {
        final authSource = _read(
          'lib/core/services/biometric_service.dart',
        );

        final storageSource = _read(
          'lib/core/services/storage_service.dart',
        );

        final enabled = _slice(
          authSource,
          'static Future<bool> isDeviceAuthEnabled() async {',
          'static Future<String> getDeviceAuthLabel() async {',
        );

        expect(
          enabled,
          contains('StorageService.getDeviceAuthPreference()'),
        );

        expect(
          enabled,
          contains('preference != false'),
          reason:
              'A supported secure phone should offer offline sign-in unless the user explicitly disabled it.',
        );

        expect(
          storageSource,
          contains(
            'static Future<bool?> getDeviceAuthPreference() async',
          ),
          reason:
              'AgentPro must distinguish never-configured from an explicit false preference.',
        );

        expect(
          storageSource,
          contains("if (value == 'false')"),
          reason: 'An explicit user opt-out must remain durable.',
        );
      },
    );

    test(
      'cold start locks a resumable session behind device authentication',
      () {
        final source = _read(
          'lib/core/auth/auth_bloc.dart',
        );

        final check = _slice(
          source,
          'Future<void> _onCheck(',
          'Future<void> _onLogin(',
        );

        expect(
          check,
          contains('StorageService.getUser()'),
        );

        expect(
          check,
          contains('StorageService.getAccessToken()'),
        );

        expect(
          check,
          contains('StorageService.isSessionLocked()'),
        );

        expect(
          check,
          contains('StorageService.getDeviceAuthPreference()'),
          reason:
              'Cold-start restoration must use the durable device-authentication preference.',
        );

        expect(
          check,
          contains('StorageService.setSessionLocked(true)'),
          reason:
              'A saved session must become locally locked before cold-start UI access.',
        );

        expect(
          check,
          contains('emit(AuthUnauthenticated())'),
        );

        expect(
          check,
          contains('state is AuthAuthenticated'),
          reason:
              'A device-authentication challenge that wins the startup race must not be re-locked afterward.',
        );

        expect(
          check,
          isNot(contains('ApiClient')),
          reason:
              'Cold-start device locking must remain entirely local and work without internet.',
        );

        final preferenceIndex = check.indexOf(
          'StorageService.getDeviceAuthPreference()',
        );

        final lockIndex = check.indexOf(
          'StorageService.setSessionLocked(true)',
        );

        expect(
          preferenceIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          lockIndex,
          greaterThan(preferenceIndex),
          reason:
              'AgentPro must establish that device authentication is enabled before creating the cold-start lock.',
        );
      },
    );

    test(
      'offline password login directs resumable users to local unlock',
      () {
        final source = _read(
          'lib/core/auth/auth_bloc.dart',
        );

        final login = _slice(
          source,
          'Future<void> _onLogin(',
          'Future<void> _onRegisterPersonal(',
        );

        expect(
          login,
          contains('on DioException catch'),
          reason:
              'Password-login failures should be classified from Dio instead of parsing exception strings.',
        );

        expect(
          login,
          contains('DioExceptionType.connectionError'),
        );

        expect(
          login,
          contains('DioExceptionType.connectionTimeout'),
        );

        expect(
          login,
          contains('DioExceptionType.sendTimeout'),
        );

        expect(
          login,
          contains('DioExceptionType.receiveTimeout'),
        );

        expect(
          login,
          contains('use Unlock AgentPro'),
          reason:
              'A network outage should direct a previously authenticated user to the offline device-auth path.',
        );

        expect(
          login,
          contains('statusCode == 401'),
        );

        expect(
          login,
          contains('statusCode == 403'),
        );

        expect(
          login,
          isNot(contains("e.toString().contains('401')")),
          reason:
              'Authentication status must not be inferred from exception text.',
        );
      },
    );

    test(
      'device authentication failures are visible and actionable',
      () {
        final serviceSource = _read(
          'lib/core/services/biometric_service.dart',
        );

        final loginSource = _read(
          'lib/features/auth/login_screen.dart',
        );

        final settingsSource = _read(
          'lib/features/settings/settings_screen.dart',
        );

        expect(
          serviceSource,
          contains(
            'static Future<BiometricResult> enableDeviceAuthWithResult() async',
          ),
          reason:
              'Settings needs the exact local-auth result instead of a generic boolean failure.',
        );

        expect(
          loginSource,
          contains('Phone authentication is unavailable'),
        );

        expect(
          loginSource,
          contains('Set up a phone PIN, pattern, password'),
        );

        expect(
          loginSource,
          contains('Phone security is not fully set up'),
        );

        expect(
          loginSource,
          contains('AgentPro could not open phone authentication'),
        );

        expect(
          settingsSource,
          contains('BiometricService.enableDeviceAuthWithResult()'),
        );

        expect(
          settingsSource,
          contains('BiometricResult.notAvailable'),
        );

        expect(
          settingsSource,
          contains('BiometricResult.notEnrolled'),
        );

        expect(
          settingsSource,
          contains('BiometricResult.lockedOut'),
        );

        expect(
          settingsSource,
          contains('BiometricResult.permanentlyLockedOut'),
        );

        expect(
          settingsSource,
          contains('BiometricResult.cancelled'),
        );
      },
    );

    test(
      'cancelled authentication cannot expose authenticated Home',
      () {
        final authSource = _read(
          'lib/core/auth/auth_bloc.dart',
        );

        final serviceSource = _read(
          'lib/core/services/biometric_service.dart',
        );

        final loginSource = _read(
          'lib/features/auth/login_screen.dart',
        );

        final androidSource = _read(
          'android/app/src/main/kotlin/'
          'com/agentpro/ghana/MainActivity.kt',
        );

        final check = _slice(
          authSource,
          'Future<void> _onCheck(',
          'Future<void> _onLogin(',
        );

        final unlock = _slice(
          authSource,
          'Future<void> _onUnlock(',
          'Future<void> _onSessionInvalidated(',
        );

        expect(
          check,
          contains('StorageService.getDeviceAuthPreference()'),
        );

        expect(
          check,
          contains('deviceAuthPreference != false'),
          reason: 'Cold start must lock unless the user explicitly opted out.',
        );

        expect(
          check,
          isNot(
            contains('BiometricService.isDeviceAuthEnabled()'),
          ),
          reason:
              'Startup must not fail open because of a transient platform-auth availability error.',
        );

        expect(
          authSource,
          contains('final DeviceAuthApproval approval;'),
        );

        expect(
          unlock,
          contains(
            'BiometricService.consumeUnlockApproval(event.approval)',
          ),
          reason:
              'AuthUnlockEvent alone must never be trusted to clear the local lock.',
        );

        expect(
          serviceSource,
          contains('DeviceAuthApproval._()'),
          reason:
              'Only the device-authentication service may create an unlock approval.',
        );

        expect(
          serviceSource,
          contains('pendingUnlockApproval'),
        );

        expect(
          loginSource,
          contains('AuthUnlockEvent(approval)'),
        );

        expect(
          androidSource,
          contains('KeyguardManager'),
        );

        expect(
          androidSource,
          contains('isDeviceSecure'),
          reason:
              'Android Swipe/None must not qualify as secure AgentPro authentication.',
        );

        expect(
          serviceSource,
          contains(
            "'com.agentpro.ghana/device_security'",
          ),
        );

        expect(
          serviceSource,
          contains(
            "invokeMethod<bool>(\n                'isDeviceSecure'",
          ),
        );
      },
    );

    test(
      'stale startup check cannot override a successful device unlock',
      () {
        final authSource = _read(
          'lib/core/auth/auth_bloc.dart',
        );

        final check = _slice(
          authSource,
          'Future<void> _onCheck(',
          'Future<void> _onLogin(',
        );

        expect(
          check,
          contains('final startupState = state;'),
        );

        expect(
          check,
          contains('!identical(state, startupState)'),
        );

        final firstRaceGuard = check.indexOf(
          '!identical(state, startupState)',
        );

        final lockedBranch = check.indexOf(
          'if (sessionLocked)',
        );

        expect(firstRaceGuard, greaterThanOrEqualTo(0));
        expect(lockedBranch, greaterThan(firstRaceGuard));

        expect(
          check,
          contains(
            'if (state is AuthAuthenticated) {\n'
            '          await StorageService.setSessionLocked(false);',
          ),
        );
      },
    );

    test(
      'mobile-money PIN remains outside device authentication',
      () {
        final source = _read(
          'lib/core/services/biometric_service.dart',
        );

        expect(
          source,
          contains(
            'It never replaces, captures, stores, pre-fills, or submits a mobile-money',
          ),
        );

        expect(
          source,
          isNot(contains('momo_pin')),
        );

        expect(
          source,
          isNot(contains('mobile_money_pin')),
        );
      },
    );
  });
}
