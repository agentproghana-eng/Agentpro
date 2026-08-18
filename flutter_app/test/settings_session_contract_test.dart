import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file to exist: $path',
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
  group('Settings session lifecycle contracts', () {
    test(
      'explicit AuthLogoutEvent always performs a full sign out',
      () {
        final source = _readSource('lib/core/auth/auth_bloc.dart');

        final logout = _slice(
          source,
          'Future<void> _onLogout(',
          'Future<void> _onUpdateUser(',
        );

        expect(
          logout,
          isNot(contains('deviceAuthEnabled')),
          reason:
              'Explicit Sign Out must not become a soft lock when phone authentication is enabled.',
        );

        expect(
          logout,
          isNot(contains('clearAccessTokenOnly')),
          reason: 'Explicit Sign Out must remove the durable local session.',
        );

        expect(
          logout,
          contains("'/auth/logout'"),
          reason:
              'Explicit Sign Out must revoke the current server refresh session.',
        );

        expect(
          logout,
          contains('StorageService.clearSession()'),
          reason:
              'Explicit Sign Out must clear local access, refresh, and cached-user session data.',
        );
      },
    );

    test(
      'inactivity uses a separate lock event instead of explicit logout',
      () {
        final authSource = _readSource('lib/core/auth/auth_bloc.dart');

        final inactivitySource = _readSource(
          'lib/core/services/inactivity_service.dart',
        );

        expect(
          authSource,
          contains('class AuthLockEvent extends AuthEvent'),
          reason:
              'Soft inactivity locking must be represented separately from explicit Sign Out.',
        );

        expect(
          authSource,
          contains('on<AuthLockEvent>'),
          reason: 'AuthBloc must register the separate soft-lock event.',
        );

        expect(
          inactivitySource,
          contains('AuthLockEvent()'),
          reason: 'Inactivity must dispatch the soft-lock event.',
        );

        expect(
          inactivitySource,
          isNot(contains('AuthLogoutEvent()')),
          reason:
              'Inactivity must not masquerade as an explicit account Sign Out.',
        );
      },
    );

    test(
      'startup check cannot silently bypass an inactivity lock',
      () {
        final authSource = _readSource('lib/core/auth/auth_bloc.dart');

        final check = _slice(
          authSource,
          'Future<void> _onCheck(',
          'Future<void> _onLogin(',
        );

        expect(
          check,
          isNot(contains('ApiClient.refreshToken()')),
          reason:
              'A normal startup AuthCheckEvent must not exchange a preserved refresh token after the app has been soft-locked.',
        );

        expect(
          authSource,
          contains('class AuthUnlockEvent extends AuthEvent'),
          reason:
              'Biometric restoration needs a distinct authenticated unlock event.',
        );

        expect(
          authSource,
          contains('on<AuthUnlockEvent>'),
          reason: 'AuthBloc must register the authenticated unlock event.',
        );

        final unlock = _slice(
          authSource,
          'Future<void> _onUnlock(',
          'Future<void> _onLogout(',
        );

        expect(
          unlock,
          contains('ApiClient.refreshToken()'),
          reason:
              'Only the authenticated unlock path should exchange the preserved refresh token.',
        );
      },
    );

    test(
      'successful phone authentication dispatches the unlock event',
      () {
        final loginSource = _readSource(
          'lib/features/auth/login_screen.dart',
        );

        final biometricFlow = _slice(
          loginSource,
          'Future<void> _tryBiometric() async',
          'void _login()',
        );

        expect(
          biometricFlow,
          contains('AuthUnlockEvent()'),
          reason:
              'A successful device-authentication challenge must use the dedicated unlock event.',
        );

        expect(
          biometricFlow,
          isNot(contains('AuthCheckEvent()')),
          reason:
              'The generic startup check must not be reused as proof of device authentication.',
        );

        expect(
          loginSource,
          contains('StorageService.getRefreshToken()'),
          reason:
              'The biometric sign-in affordance must only appear when a resumable refresh session actually exists.',
        );
      },
    );

    test(
      'disabling phone authentication does not call logout directly',
      () {
        final source = _readSource(
          'lib/features/settings/settings_screen.dart',
        );

        final toggle = _slice(
          source,
          'Future<void> _toggleBiometric',
          'Future<void> _addPersonalCapability',
        );

        expect(
          toggle,
          contains('BiometricService.disableBiometric()'),
        );

        expect(
          toggle,
          isNot(contains("'/auth/logout'")),
          reason:
              'Turning off a device preference must not invoke account logout or revoke unrelated sessions.',
        );
      },
    );

    test(
      'successful password change immediately ends the local session',
      () {
        final source = _readSource(
          'lib/features/settings/settings_screen.dart',
        );

        final submit = _slice(
          source,
          'Future<void> _submit() async',
          '@override\n  Widget build',
        );

        final patchIndex = submit.indexOf(
          "patch('/users/me/password'",
        );

        final logoutIndex = submit.indexOf(
          'AuthLogoutEvent()',
        );

        expect(
          patchIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          logoutIndex,
          greaterThan(patchIndex),
          reason:
              'After the backend revokes all refresh sessions, the app must immediately clear its now-invalid local session.',
        );
      },
    );

    test(
      'API auto-refresh cannot resurrect a soft-locked session',
      () {
        final source = _readSource(
          'lib/core/api/api_client.dart',
        );

        final interceptor = _slice(
          source,
          'onError: (DioException error, handler) async {',
          'static Future<bool> refreshToken()',
        );

        final accessGuardIndex = interceptor.indexOf(
          'final currentAccessToken = '
          'await StorageService.getAccessToken();',
        );

        final refreshIndex = interceptor.indexOf(
          'final refreshed = await refreshToken();',
        );

        expect(
          accessGuardIndex,
          greaterThanOrEqualTo(0),
          reason:
              'Before refreshing a 401, the interceptor must verify that the local access token still exists. A soft lock deliberately removes it.',
        );

        expect(
          refreshIndex,
          greaterThan(accessGuardIndex),
          reason:
              'The access-token presence check must happen before refreshToken() can run.',
        );

        expect(
          interceptor,
          matches(
            RegExp(
              r'final\s+canRefresh\s*=\s*'
              r'currentAccessToken\s*!=\s*null\s*&&\s*'
              r'currentAccessToken\.isNotEmpty\s*;',
            ),
          ),
          reason:
              'The interceptor needs an explicit current-session refresh guard.',
        );

        expect(
          interceptor,
          matches(
            RegExp(
              r'isUnauthorized\s*&&\s*canRefresh',
            ),
          ),
          reason:
              'A 401 must not exchange a preserved refresh token after the session has been soft-locked.',
        );
      },
    );

    test(
      'Settings version comes from installed package metadata',
      () {
        final source = _readSource(
          'lib/features/settings/settings_screen.dart',
        );

        expect(
          source,
          contains(
            'package:package_info_plus/package_info_plus.dart',
          ),
        );

        expect(
          source,
          contains('PackageInfo.fromPlatform()'),
        );

        expect(
          source,
          isNot(contains("trailing: Text('2.0.0')")),
          reason:
              'Settings must not maintain an independent hardcoded application version.',
        );
      },
    );
  });
}
