import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/core/services/device_clock_service.dart';
import 'package:agent_pro_ghana/core/services/storage_service.dart';

Map<String, dynamic> _record({
  String mode = 'business',
  String userId = 'user-a',
  String sessionId = 'session-a',
  String verifiedAt = '2030-01-01T00:00:00.000Z',
  String authorizedUntil = '2030-01-01T12:00:00.000Z',
  int elapsedRealtimeMs = 1000,
  int bootCount = 7,
  bool personalPaid = false,
  String? personalPaidUntil,
}) {
  return <String, dynamic>{
    'version': 2,
    'mode': mode,
    'user_id': userId,
    'session_id': sessionId,
    'server_verified_at': verifiedAt,
    'authorized_until': authorizedUntil,
    'elapsed_realtime_ms': elapsedRealtimeMs,
    'boot_count': bootCount,
    if (mode == 'personal') 'personal_paid': personalPaid,
    if (personalPaidUntil != null) 'personal_paid_until': personalPaidUntil,
  };
}

DeviceClockSnapshot _clock(
  int elapsedMs, {
  int bootCount = 7,
}) {
  return DeviceClockSnapshot(
    elapsedRealtimeMs: elapsedMs,
    bootCount: bootCount,
  );
}

String _fakeAccessToken({
  required String sessionId,
}) {
  String encode(Map<String, dynamic> value) {
    return base64Url
        .encode(
          utf8.encode(jsonEncode(value)),
        )
        .replaceAll('=', '');
  }

  return [
    encode({'alg': 'none'}),
    encode({'session_id': sessionId}),
    'signature',
  ].join('.');
}

void main() {
  group('Offline server trust behavior', () {
    test(
      'late proof from another account cannot match the current session',
      () {
        expect(
          offlineTrustProofMatchesCurrentSession(
            proofUserId: 'user-a',
            proofSessionId: 'session-a',
            currentUserId: 'user-b',
            currentSessionId: 'session-b',
          ),
          isFalse,
        );
      },
    );

    test(
      'same-user response from an old durable session is rejected',
      () {
        expect(
          offlineTrustProofMatchesCurrentSession(
            proofUserId: 'user-a',
            proofSessionId: 'session-old',
            currentUserId: 'user-a',
            currentSessionId: 'session-new',
          ),
          isFalse,
        );

        expect(
          offlineTrustProofMatchesCurrentSession(
            proofUserId: 'user-a',
            proofSessionId: 'session-new',
            currentUserId: 'user-a',
            currentSessionId: 'session-new',
          ),
          isTrue,
        );
      },
    );

    test(
      'current durable session is extracted from the access token',
      () {
        expect(
          sessionIdFromAccessToken(
            _fakeAccessToken(
              sessionId: 'session-123',
            ),
          ),
          'session-123',
        );

        expect(
          sessionIdFromAccessToken('not-a-jwt'),
          isNull,
        );
      },
    );

    test(
      'Business trust expires at server authorization before 12-hour window',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(
            authorizedUntil: '2030-01-01T02:00:00.000Z',
          ),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: false,
          clock: _clock(
            const Duration(
                  hours: 2,
                  minutes: 1,
                ).inMilliseconds +
                1000,
          ),
          wallNow: DateTime.parse(
            '2030-01-01T02:01:00.000Z',
          ),
        );

        expect(
          trust.status,
          OfflineServerTrustStatus.expired,
        );
      },
    );

    test(
      'Business trust cannot outlive its 12-hour local outage window',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(
            authorizedUntil: '2030-01-03T00:00:00.000Z',
          ),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: false,
          clock: _clock(
            const Duration(
                  hours: 12,
                  minutes: 1,
                ).inMilliseconds +
                1000,
          ),
          wallNow: DateTime.parse(
            '2030-01-01T12:01:00.000Z',
          ),
        );

        expect(
          trust.status,
          OfflineServerTrustStatus.expired,
        );
      },
    );

    test(
      'Personal Global trust remains valid after Paid override entitlement expires',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(
            mode: 'personal',
            authorizedUntil: '2030-01-02T00:00:00.000Z',
            personalPaid: true,
            personalPaidUntil: '2030-01-01T01:00:00.000Z',
          ),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: true,
          clock: _clock(
            const Duration(
                  hours: 2,
                ).inMilliseconds +
                1000,
          ),
          wallNow: DateTime.parse(
            '2030-01-01T02:00:00.000Z',
          ),
        );

        expect(
          trust.status,
          OfflineServerTrustStatus.valid,
        );

        expect(
          trust.hasPersonalPaidEntitlement,
          isFalse,
        );
      },
    );

    test(
      'active Personal Paid proof authorizes an owned override',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(
            mode: 'personal',
            authorizedUntil: '2030-01-02T00:00:00.000Z',
            personalPaid: true,
            personalPaidUntil: '2030-01-01T06:00:00.000Z',
          ),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: true,
          clock: _clock(
            const Duration(
                  hours: 2,
                ).inMilliseconds +
                1000,
          ),
          wallNow: DateTime.parse(
            '2030-01-01T02:00:00.000Z',
          ),
        );

        expect(trust.isValid, isTrue);
        expect(
          trust.hasPersonalPaidEntitlement,
          isTrue,
        );
      },
    );

    test(
      'device reboot invalidates an otherwise fresh proof',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: false,
          clock: _clock(
            2000,
            bootCount: 8,
          ),
          wallNow: DateTime.parse(
            '2030-01-01T00:00:01.000Z',
          ),
        );

        expect(
          trust.status,
          OfflineServerTrustStatus.deviceRebooted,
        );
      },
    );

    test(
      'backward wall-clock movement fails closed',
      () {
        final trust = evaluateOfflineServerTrustRecord(
          stored: _record(),
          currentUserId: 'user-a',
          currentSessionId: 'session-a',
          isPersonal: false,
          clock: _clock(
            const Duration(
                  minutes: 30,
                ).inMilliseconds +
                1000,
          ),
          wallNow: DateTime.parse(
            '2029-12-31T23:00:00.000Z',
          ),
        );

        expect(
          trust.status,
          OfflineServerTrustStatus.clockRollbackDetected,
        );
      },
    );
  });
}
