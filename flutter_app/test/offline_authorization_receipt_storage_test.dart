import 'package:agent_pro_ghana/core/services/storage_service.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> trustRecord({
  String mode = 'business',
  String userId = 'user-1',
  String sessionId = 'session-1',
  String authorizedUntil = '2030-01-01T12:00:00.000Z',
}) {
  return {
    'version': 2,
    'mode': mode,
    'user_id': userId,
    'session_id': sessionId,
    'server_verified_at': '2030-01-01T00:00:00.000Z',
    'authorized_until': authorizedUntil,
    'elapsed_realtime_ms': 1000,
    'boot_count': 1,
  };
}

void main() {
  group(
    'offline authorization receipt storage contract',
    () {
      test(
        'accepts receipt only for matching v2 trust identity and lifetime',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'business',
            currentUserId: 'user-1',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isTrue);
        },
      );

      test(
        'rejects account mismatch',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'business',
            currentUserId: 'other-user',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isFalse);
        },
      );

      test(
        'rejects durable session mismatch',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'business',
            currentUserId: 'user-1',
            currentSessionId: 'different-session',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isFalse);
        },
      );

      test(
        'rejects mode mismatch',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'personal',
            currentUserId: 'user-1',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isFalse);
        },
      );

      test(
        'rejects authorization lifetime mismatch',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'business',
            currentUserId: 'user-1',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T11:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isFalse);
        },
      );

      test(
        'rejects non-v2 trust records',
        () {
          final stored = trustRecord();
          stored['version'] = 1;

          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: stored,
            mode: 'business',
            currentUserId: 'user-1',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'apr1.payload.signature',
          );

          expect(accepted, isFalse);
        },
      );

      test(
        'preserves Business receipt across an identical replacement proof',
        () {
          final stored = trustRecord();
          stored['authorization_receipt'] = 'apr1.payload.signature';

          final receipt = offlineAuthorizationReceiptForReplacementTrust(
            stored: stored,
            mode: 'business',
            userId: 'user-1',
            sessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            personalPaid: false,
          );

          expect(
            receipt,
            'apr1.payload.signature',
          );
        },
      );

      test(
        'drops receipt when replacement authorization lifetime changes',
        () {
          final stored = trustRecord();
          stored['authorization_receipt'] = 'apr1.payload.signature';

          final receipt = offlineAuthorizationReceiptForReplacementTrust(
            stored: stored,
            mode: 'business',
            userId: 'user-1',
            sessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T13:00:00.000Z',
            ),
            personalPaid: false,
          );

          expect(receipt, isNull);
        },
      );

      test(
        'drops Personal receipt when paid entitlement state changes',
        () {
          final stored = trustRecord(
            mode: 'personal',
          );

          stored['personal_paid'] = true;
          stored['personal_paid_until'] = '2030-01-01T10:00:00.000Z';
          stored['authorization_receipt'] = 'apr1.payload.signature';

          final receipt = offlineAuthorizationReceiptForReplacementTrust(
            stored: stored,
            mode: 'personal',
            userId: 'user-1',
            sessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            personalPaid: false,
          );

          expect(receipt, isNull);
        },
      );

      test(
        'preserves Personal receipt only with identical paid lifetime',
        () {
          final stored = trustRecord(
            mode: 'personal',
          );

          stored['personal_paid'] = true;
          stored['personal_paid_until'] = '2030-01-01T10:00:00.000Z';
          stored['authorization_receipt'] = 'apr1.payload.signature';

          final receipt = offlineAuthorizationReceiptForReplacementTrust(
            stored: stored,
            mode: 'personal',
            userId: 'user-1',
            sessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            personalPaid: true,
            personalPaidUntil: DateTime.parse(
              '2030-01-01T10:00:00.000Z',
            ),
          );

          expect(
            receipt,
            'apr1.payload.signature',
          );
        },
      );

      test(
        'rejects malformed receipt envelope',
        () {
          final accepted = offlineAuthorizationReceiptMatchesTrustRecord(
            stored: trustRecord(),
            mode: 'business',
            currentUserId: 'user-1',
            currentSessionId: 'session-1',
            authorizedUntil: DateTime.parse(
              '2030-01-01T12:00:00.000Z',
            ),
            receipt: 'unsigned-client-claim',
          );

          expect(accepted, isFalse);
        },
      );
    },
  );
}
