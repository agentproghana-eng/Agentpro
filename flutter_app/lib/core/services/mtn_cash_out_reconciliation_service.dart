import 'dart:async';

import 'package:flutter/services.dart';

import '../api/api_client.dart';

/// Reconciles MTN Cash Out receipts captured by the Android SMS receiver.
///
/// Android persists matched receipts first. This service acknowledges a
/// receipt only after the backend accepts the corresponding
/// pending_confirmation -> success transition, so temporary connectivity or
/// authentication failures never lose a financial confirmation.
class MtnCashOutReconciliationService {
  MtnCashOutReconciliationService._();

  static const _channel = MethodChannel(
    'com.agentpro.ghana/mtn_cashout_sms',
  );

  static bool _initialized = false;
  static bool _reconciling = false;
  static bool _rerunRequested = false;

  static void initialize() {
    if (_initialized) {
      return;
    }

    _initialized = true;

    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onMatchedCashOutReceiptAvailable') {
        unawaited(reconcile());
      }

      return null;
    });
  }

  static Future<void> reconcile() async {
    initialize();

    if (_reconciling) {
      _rerunRequested = true;
      return;
    }

    _reconciling = true;

    try {
      do {
        _rerunRequested = false;

        final raw =
            await _channel.invokeMethod<List<dynamic>>(
                  'getMatchedCashOutReceipts',
                ) ??
                const <dynamic>[];

        for (final entry in raw) {
          if (entry is! Map) {
            continue;
          }

          final transactionId =
              entry['transaction_id']?.toString().trim() ?? '';

          final networkReference =
              entry['network_reference']?.toString().trim() ?? '';

          if (
              transactionId.isEmpty ||
              networkReference.isEmpty ||
              transactionId.startsWith('local_')) {
            // Offline-local IDs cannot yet be promoted through the online
            // completion route because their final server ID is assigned by
            // the offline queue. Leave the receipt persisted for verification.
            continue;
          }

          try {
            await ApiClient.instance.patch(
              '/transactions/$transactionId/complete',
              data: {
                'status': 'success',
                'network_reference': networkReference,
                'failure_reason': null,
                'ussd_session_log': const [],
              },
            );

            await _channel.invokeMethod(
              'acknowledgeMatchedCashOutReceipt',
              {
                'transaction_id': transactionId,
                'network_reference': networkReference,
              },
            );
          } catch (_) {
            // Keep the matched receipt persisted. Authentication,
            // connectivity, or backend failure can be retried on the next
            // app resume/authentication/native receipt notification.
          }
        }
      } while (_rerunRequested);
    } finally {
      _reconciling = false;
    }
  }
}
