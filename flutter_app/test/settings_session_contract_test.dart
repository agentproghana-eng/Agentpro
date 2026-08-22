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
              'A normal startup AuthCheckEvent must never use the network to bypass a local inactivity lock.',
        );

        expect(
          check,
          contains('StorageService.isSessionLocked()'),
          reason:
              'Startup must consult the durable local lock state before restoring an authenticated session.',
        );

        expect(
          authSource,
          contains('class AuthUnlockEvent extends AuthEvent'),
          reason:
              'Device-auth restoration needs a distinct authenticated unlock event.',
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
          isNot(contains('ApiClient.refreshToken()')),
          reason:
              'Successful phone authentication must unlock AgentPro locally without consuming internet data.',
        );

        expect(
          unlock,
          contains('StorageService.setSessionLocked(false)'),
          reason:
              'The authenticated unlock path must clear the durable local lock.',
        );

        expect(
          unlock,
          contains('StorageService.getAccessToken()'),
          reason:
              'Offline unlock requires an existing encrypted authenticated session.',
        );
      },
    );

    test(
      'push registration stays offline while locked and retries after trusted unlock',
      () {
        final authSource = _readSource(
          'lib/core/auth/auth_bloc.dart',
        );

        final notificationSource = _readSource(
          'lib/core/services/notification_service.dart',
        );

        final startup = _slice(
          authSource,
          'Future<void> _onCheck(',
          'Future<void> _onLogin(',
        );

        final unlock = _slice(
          authSource,
          'Future<void> _onUnlock(',
          'Future<void> _onSessionInvalidated(',
        );

        final notificationInit = _slice(
          notificationSource,
          'static Future<void> _initialize() async',
          'static Future<void> _onForegroundMessage',
        );

        final sync = _slice(
          notificationSource,
          'static Future<void> syncTokenWithBackend()',
          '/// Get the FCM token',
        );

        expect(
          notificationInit,
          isNot(
            contains(
              'await syncTokenWithBackend()',
            ),
          ),
          reason:
              'Notification infrastructure startup must not race the auth lifecycle by performing authenticated FCM registration on its own.',
        );

        expect(
          notificationInit,
          contains('_ready = true'),
          reason:
              'Notification readiness must become explicit only after notification initialization has completed.',
        );

        expect(
          notificationInit,
          contains('_backendSyncPending'),
          reason:
              'Notification initialization must fulfil an authenticated FCM sync request that arrived before readiness.',
        );

        expect(
          notificationInit,
          contains('syncTokenWithBackend()'),
          reason:
              'A pending authenticated FCM sync must be retried when notification initialization becomes ready.',
        );

        expect(
          startup,
          contains(
            'NotificationService.syncTokenWithBackend()',
          ),
          reason:
              'An already-authenticated unlocked startup must get a best-effort opportunity to repair FCM registration.',
        );

        expect(
          unlock,
          contains(
            'NotificationService.syncTokenWithBackend()',
          ),
          reason:
              'A trusted local unlock must retry FCM registration after a locked startup skipped it.',
        );

        final unlockClearIndex = unlock.indexOf(
          'StorageService.setSessionLocked(false)',
        );

        final unlockSyncIndex = unlock.indexOf(
          'NotificationService.syncTokenWithBackend()',
        );

        expect(
          unlockClearIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          unlockSyncIndex,
          greaterThan(unlockClearIndex),
          reason:
              'Push synchronization must run only after the durable local lock has been cleared.',
        );

        expect(
          sync,
          contains('StorageService.isSessionLocked()'),
          reason:
              'Push registration must consult the durable local lock before attempting authenticated network work.',
        );

        final firstLockIndex = sync.indexOf(
          'StorageService.isSessionLocked()',
        );

        final readinessIndex = sync.indexOf(
          'if (!_ready)',
        );

        final pendingIndex = sync.indexOf(
          '_backendSyncPending = true',
        );

        final tokenIndex = sync.indexOf(
          '_messaging.getToken()',
        );

        final putIndex = sync.indexOf(
          'ApiClient.instance.put(',
        );

        expect(
          firstLockIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          readinessIndex,
          greaterThan(firstLockIndex),
          reason:
              'The durable local lock must be checked before an FCM sync can be deferred.',
        );

        expect(
          pendingIndex,
          greaterThan(readinessIndex),
          reason:
              'An authenticated sync requested before notification readiness must be remembered.',
        );

        expect(
          tokenIndex,
          greaterThan(pendingIndex),
          reason:
              'Firebase token acquisition must occur only after lock and readiness checks.',
        );

        expect(
          sync,
          matches(
            RegExp(
              r'final\s+sessionLocked\s*=\s*await\s+'
              r'StorageService\.isSessionLocked\(\);\s*'
              r'if\s*\(sessionLocked\)\s*\{\s*return;',
            ),
          ),
          reason:
              'The FCM synchronization path must fail closed while the local session is locked.',
        );

        expect(
          sync,
          contains(
            'ApiClient.instance.put(\n'
            "        '/auth/fcm-token'",
          ),
          reason:
              'The unlocked retry must continue to use the authenticated FCM ownership endpoint.',
        );

        expect(
          putIndex,
          greaterThan(tokenIndex),
          reason:
              'The backend registration request must occur only after local lock and token checks.',
        );
      },
    );

    test(
      'successful phone authentication dispatches the unlock event',
      () {
        final loginSource = _readSource(
          'lib/features/auth/login_screen.dart',
        );

        final deviceAuthFlow = _slice(
          loginSource,
          'Future<void> _tryDeviceAuth() async',
          'void _login()',
        );

        expect(
          deviceAuthFlow,
          contains('AuthUnlockEvent(approval)'),
          reason:
              'A successful device-authentication challenge must use the dedicated unlock event.',
        );

        expect(
          deviceAuthFlow,
          isNot(contains('AuthCheckEvent()')),
          reason:
              'The generic startup check must not be reused as proof of device authentication.',
        );

        expect(
          loginSource,
          contains('StorageService.getRefreshToken()'),
          reason:
              'The offline unlock affordance must only appear when a resumable refresh session actually exists.',
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
          'Future<void> _toggleDeviceAuth',
          'Future<void> _addPersonalCapability',
        );

        expect(
          toggle,
          contains('BiometricService.disableDeviceAuth()'),
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

        final requestGuard = _slice(
          source,
          'onRequest: (options, handler) async {',
          'onError: (DioException error, handler) async {',
        );

        expect(
          requestGuard,
          contains('StorageService.isSessionLocked()'),
          reason:
              'Every API request must check the durable local lock before network transmission.',
        );

        expect(
          requestGuard,
          contains("error: 'SESSION_LOCKED'"),
          reason:
              'Locked non-auth requests must be rejected locally instead of reaching the network.',
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
          'final refreshOutcome = '
          'await _refreshTokenWithOutcome();',
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
              r'final\s+canRefresh\s*=\s*!sessionLocked\s*&&\s*'
              r'currentAccessToken\s*!=\s*null\s*&&\s*'
              r'currentAccessToken\.isNotEmpty\s*;',
            ),
          ),
          reason:
              'Token refresh must require both an unlocked local session and an existing access token.',
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
      'automatic refresh invalidates only terminal session rejection',
      () {
        final source = _readSource(
          'lib/core/api/api_client.dart',
        );

        expect(
          source,
          contains(
            'enum TokenRefreshOutcome',
          ),
        );

        final interceptor = _slice(
          source,
          'onError: (DioException error, handler) async {',
          'static Future<void> _invalidateSession()',
        );

        expect(
          interceptor,
          contains(
            'await _refreshTokenWithOutcome()',
          ),
        );

        final terminalIndex = interceptor.indexOf(
          'TokenRefreshOutcome.terminalFailure',
        );

        final invalidationIndex = interceptor.indexOf(
          'await _invalidateSession();',
        );

        expect(
          terminalIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          invalidationIndex,
          greaterThan(terminalIndex),
          reason:
              'Only a terminal credential/session rejection may destroy the local session.',
        );

        final refreshLogic = _slice(
          source,
          'static Future<TokenRefreshOutcome> _performTokenRefresh() async {',
          '\n}',
        );

        final terminalStatusHelper = _slice(
          source,
          'static bool _isTerminalRefreshStatus(',
          'static Future<TokenRefreshOutcome> '
              '_performTokenRefresh() async {',
        );

        expect(
          terminalStatusHelper,
          contains('statusCode == 401'),
        );

        expect(
          terminalStatusHelper,
          contains('statusCode == 403'),
        );

        expect(
          refreshLogic,
          contains(
            '_isTerminalRefreshStatus(statusCode)',
          ),
          reason:
              'The refresh path must classify explicit terminal HTTP responses through the dedicated helper.',
        );

        expect(
          refreshLogic,
          contains(
            'TokenRefreshOutcome.transientFailure',
          ),
          reason:
              'Network, server and malformed-response failures must retain the encrypted session.',
        );

        expect(
          refreshLogic,
          contains('validateStatus: (_) => true'),
          reason:
              'The refresh client must inspect HTTP status explicitly instead of collapsing all non-2xx responses into Dio exceptions.',
        );

        final invalidation = _slice(
          source,
          'static Future<void> _invalidateSession()',
          'static Future<bool> refreshToken()',
        );

        final clearIndex = invalidation.indexOf(
          'StorageService.clearSession()',
        );

        final publishIndex = invalidation.indexOf(
          '_sessionInvalidationController.add(null)',
        );

        expect(
          clearIndex,
          greaterThanOrEqualTo(0),
        );

        expect(
          publishIndex,
          greaterThan(clearIndex),
          reason:
              'Credentials must be cleared before authenticated UI invalidation is published.',
        );
      },
    );

    test(
      'AuthBloc immediately leaves authenticated state after API session invalidation',
      () {
        final source = _readSource(
          'lib/core/auth/auth_bloc.dart',
        );

        expect(
          source,
          contains(
            'class AuthSessionInvalidatedEvent extends AuthEvent',
          ),
        );

        expect(
          source,
          contains(
            'ApiClient.sessionInvalidations.listen',
          ),
          reason:
              'AuthBloc must observe irrecoverable API session failures instead of relying only on secure-storage mutation.',
        );

        expect(
          source,
          contains(
            'on<AuthSessionInvalidatedEvent>',
          ),
        );

        final handler = _slice(
          source,
          'Future<void> _onSessionInvalidated(',
          'Future<void> _onLogout(',
        );

        expect(
          handler,
          contains('emit(AuthUnauthenticated())'),
          reason:
              'The visible application state must immediately become unauthenticated.',
        );

        expect(
          source,
          contains(
            'await _sessionInvalidationSubscription.cancel();',
          ),
          reason:
              'AuthBloc must release its global API invalidation listener when disposed.',
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
