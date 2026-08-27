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

String _slice(String source, String startMarker, String endMarker) {
  final start = source.indexOf(startMarker);

  expect(
    start,
    greaterThanOrEqualTo(0),
    reason: 'Missing start marker: $startMarker',
  );

  final end = source.indexOf(endMarker, start);

  expect(end, greaterThan(start), reason: 'Missing end marker: $endMarker');

  return source.substring(start, end);
}

void main() {
  group('Account deletion Flutter contracts', () {
    test('Settings exposes destructive deletion only outside superuser UI', () {
      final source = _readSource('lib/features/settings/settings_screen.dart');

      expect(source, contains("title: 'Delete Account'"));

      expect(source, contains("if (role != 'superuser')"));

      expect(
        source,
        contains(
          'Deleting the account does not reset a previously used free trial.',
        ),
      );
    });

    test(
      'deletion is blocked by every unresolved local transaction including dead letters',
      () {
        final settings = _readSource(
          'lib/features/settings/settings_screen.dart',
        );

        final queue = _readSource(
          'lib/core/services/offline_queue_service.dart',
        );

        expect(
          settings,
          contains('OfflineQueueService.unresolvedCountForUser'),
        );

        expect(settings, contains('OfflineQueueService.hasActiveSyncForUser'));

        final unresolved = _slice(
          queue,
          'static List<Map<String, dynamic>> getUnresolvedTransactionsForUser(',
          'static int unresolvedCountForUser(',
        );

        expect(unresolved, contains("transaction['synced'] != true"));

        expect(
          unresolved,
          isNot(contains("transaction['dead_letter'] != true")),
          reason:
              'Dead-letter financial work is still unresolved and must block deletion.',
        );
      },
    );

    test(
      'Delete Account requires current password and calls authenticated deletion API',
      () {
        final source = _readSource(
          'lib/features/settings/settings_screen.dart',
        );

        final sheet = _slice(
          source,
          'class _DeleteAccountSheet',
          'class _PasswordField',
        );

        expect(sheet, contains('ApiClient.instance.delete('));

        expect(sheet, contains("'/auth/account'"));

        expect(sheet, contains("'password':"));

        expect(sheet, contains('_passwordCtrl.text'));

        expect(sheet, contains('AuthAccountDeletedEvent('));
      },
    );

    test(
      'post-deletion auth lifecycle purges local account data before unauthenticated state',
      () {
        final source = _readSource('lib/core/auth/auth_bloc.dart');

        expect(
          source,
          contains('class AuthAccountDeletedEvent extends AuthEvent'),
        );

        expect(source, contains('on<AuthAccountDeletedEvent>'));

        final handler = _slice(
          source,
          'Future<void> _onAccountDeleted(',
          '@override\n  Future<void> close()',
        );

        final purgeIndex = handler.indexOf('purgeDeletedAccountData');

        final clearIndex = handler.indexOf('clearDeletedAccountData');

        final unauthIndex = handler.indexOf('emit(AuthUnauthenticated())');

        expect(purgeIndex, greaterThanOrEqualTo(0));

        expect(clearIndex, greaterThan(purgeIndex));

        expect(unauthIndex, greaterThan(clearIndex));
      },
    );

    test('deleted-account storage cleanup preserves installation identity', () {
      final source = _readSource('lib/core/services/storage_service.dart');

      final cleanup = _slice(
        source,
        'static Future<void> clearDeletedAccountData(',
        '/// Clears all session data while preserving',
      );

      expect(cleanup, contains('_offlineDashboardStorageKey'));

      expect(cleanup, contains('await clearSession()'));

      expect(cleanup, isNot(contains('_keyInstallationId')));

      expect(cleanup, isNot(contains('clearAll()')));
    });

    test(
      'account purge deletes only user-owned local records and Personal cache',
      () {
        final source = _readSource(
          'lib/core/services/offline_queue_service.dart',
        );

        final purge = _slice(
          source,
          'static Future<void> purgeDeletedAccountData(',
          'static String providerLabel(',
        );

        expect(purge, contains('_belongsToUser'));

        expect(purge, contains(r'user:$userId'));

        expect(
          purge,
          isNot(contains(r'company:${identity.companyId}')),
          reason:
              'Deleting one user must not destroy company-shared Business flow cache.',
        );
      },
    );
  });
}
