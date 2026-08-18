import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file: $path',
  );

  return file.readAsStringSync();
}

String _slice(
  String source,
  String start,
  String end,
) {
  final startIndex = source.indexOf(start);

  expect(
    startIndex,
    greaterThanOrEqualTo(0),
    reason: 'Missing start marker: $start',
  );

  final endIndex = source.indexOf(
    end,
    startIndex,
  );

  expect(
    endIndex,
    greaterThan(startIndex),
    reason: 'Missing end marker: $end',
  );

  return source.substring(
    startIndex,
    endIndex,
  );
}

void main() {
  group('Offline server trust contracts', () {
    test(
      'backend generic authentication does not issue financial trust',
      () {
        final source = _read(
          '../backend/src/middleware/auth.js',
        );

        final authenticate = _slice(
          source,
          'const authenticate = async',
          'const authorize =',
        );

        expect(
          authenticate,
          isNot(
            contains('X-AgentPro-Offline-Trust'),
          ),
        );

        expect(
          authenticate,
          contains(
            'rt.expires_at AS session_expires_at',
          ),
        );
      },
    );

    test(
      'backend v2 proof is mode, user, session and expiry bound',
      () {
        final source = _read(
          '../backend/src/middleware/auth.js',
        );

        expect(
          source,
          contains(
            "'X-AgentPro-Offline-Trust-Version'",
          ),
        );

        expect(
          source,
          contains(
            "'X-AgentPro-Offline-Trust-Mode'",
          ),
        );

        expect(
          source,
          contains(
            "'X-AgentPro-Offline-Trust-User-Id'",
          ),
        );

        expect(
          source,
          contains(
            "'X-AgentPro-Offline-Trust-Session-Id'",
          ),
        );

        expect(
          source,
          contains(
            "'X-AgentPro-Offline-Trust-Authorized-Until'",
          ),
        );
      },
    );

    test(
      'Business runtime resolver verifies Business entitlement',
      () {
        final source = _read(
          '../backend/src/routes/ussdFlow.routes.js',
        );

        final resolver = _slice(
          source,
          "router.get(\n  '/resolve',",
          "router.get(\n  '/capabilities',",
        );

        expect(
          resolver,
          contains('requireActiveSubscription'),
        );
      },
    );

    test(
      'Android trust clock uses monotonic uptime and boot count',
      () {
        final source = _read(
          'android/app/src/main/kotlin/'
          'com/agentpro/ghana/DeviceClockChannel.kt',
        );

        expect(
          source,
          contains('SystemClock.elapsedRealtime()'),
        );

        expect(
          source,
          contains('Settings.Global.BOOT_COUNT'),
        );
      },
    );

    test(
      'storage uses separate Business and Personal v2 proofs',
      () {
        final source = _read(
          'lib/core/services/storage_service.dart',
        );

        expect(
          source,
          contains(
            "'offline_server_trust_business_v2'",
          ),
        );

        expect(
          source,
          contains(
            "'offline_server_trust_personal_v2'",
          ),
        );

        expect(
          source,
          contains(
            'offlineTrustProofMatchesCurrentSession',
          ),
        );

        expect(
          source,
          contains(
            'sessionIdFromAccessToken',
          ),
        );

        expect(
          source,
          contains("'authorized_until'"),
        );
      },
    );

    test(
      'API consumes only the v2 server authorization proof',
      () {
        final source = _read(
          'lib/core/api/api_client.dart',
        );

        final response = _slice(
          source,
          'onResponse: (response, handler) async {',
          'onError: (DioException error, handler) async {',
        );

        expect(
          response,
          contains(
            "'x-agentpro-offline-trust-version'",
          ),
        );

        expect(
          response,
          contains(
            "'x-agentpro-offline-trust-user-id'",
          ),
        );

        expect(
          response,
          contains(
            "'x-agentpro-offline-trust-session-id'",
          ),
        );

        expect(
          response,
          contains(
            "'x-agentpro-offline-trust-authorized-until'",
          ),
        );

        expect(
          response,
          contains(
            'StorageService.markServerVerified(',
          ),
        );

        expect(
          response,
          isNot(
            contains(
              "'x-agentpro-session-verified'",
            ),
          ),
        );
      },
    );

    test(
      'clearing a session destroys every offline financial proof',
      () {
        final source = _read(
          'lib/core/services/storage_service.dart',
        );

        final clearSession = _slice(
          source,
          'static Future<void> clearSession() async',
          'static Future<void> clearAccessTokenOnly() async',
        );

        expect(
          clearSession,
          contains('_clearServerTrust()'),
        );
      },
    );

    test(
      'Personal offline override uses server-issued Paid entitlement',
      () {
        final source = _read(
          'lib/features/transactions/'
          'personal_transaction_screen.dart',
        );

        final helper = _slice(
          source,
          'Future<String?> _startPreparedPersonalTransaction',
          'Future<void> _submit() async',
        );

        expect(
          helper,
          contains(
            'ownerUserId != identity.userId',
          ),
        );

        expect(
          helper,
          contains(
            '!trust.hasPersonalPaidEntitlement',
          ),
        );

        expect(
          helper,
          isNot(
            contains(
              'hasActivePaidPersonalPlan(',
            ),
          ),
        );
      },
    );

    test(
      'Business and Personal offline starts check trust before local execution',
      () {
        final business = _read(
          'lib/features/transactions/'
          'transaction_screen.dart',
        );

        final personal = _read(
          'lib/features/transactions/'
          'personal_transaction_screen.dart',
        );

        expect(
          business,
          contains(
            'evaluateOfflineTransactionTrust',
          ),
        );

        expect(
          business,
          contains('isPersonal: false'),
        );

        expect(
          personal,
          contains(
            'evaluateOfflineTransactionTrust',
          ),
        );

        expect(
          personal,
          contains('isPersonal: true'),
        );
      },
    );

    test(
      'progress screen rechecks every supplied local transaction',
      () {
        final source = _read(
          'lib/features/transactions/'
          'transaction_progress_screen.dart',
        );

        final start = _slice(
          source,
          'Future<void> _startUSSD() async',
          'final requestedSimSlot',
        );

        expect(
          start,
          contains("startsWith('local_')"),
        );

        expect(
          start,
          contains(
            'evaluateOfflineTransactionTrust',
          ),
        );

        expect(
          start,
          contains(
            'isPersonal: widget.isPersonal',
          ),
        );
      },
    );
  });
}
