import 'package:flutter/services.dart';

import '../api/api_client.dart';
import 'storage_service.dart';

/// Moves already-parsed Telecel Merchant balance observations from the
/// Android native FIFO into AgentPro's authenticated reconciliation boundary.
///
/// Trust boundaries:
/// - Android alone creates observations from newly delivered T-CASH SMS.
/// - Flutter cannot create or edit a native observation.
/// - The backend derives the financial wallet from authenticated identity.
/// - Native FIFO entries are acknowledged only after backend acceptance.
/// - Observations are processed strictly oldest-first.
class TelecelMerchantBalanceReconciliationService {
  TelecelMerchantBalanceReconciliationService._();

  static const MethodChannel _channel = MethodChannel(
    'com.agentpro.ghana/telecel_merchant_balance_sms',
  );

  static bool _processing = false;
  static bool _rerunRequested = false;

  /// Best-effort reconciliation.
  ///
  /// A failure leaves the current native observation untouched so it can be
  /// retried later. Newer observations are not allowed to overtake it.
  static Future<void> reconcilePending() async {
    if (_processing) {
      _rerunRequested = true;
      return;
    }

    _processing = true;

    try {
      do {
        _rerunRequested = false;

        while (true) {
          final pending = await _readPending();

          if (pending.isEmpty) {
            break;
          }

          final observation = pending.first;

          final accepted = await _submit(observation);

          if (!accepted) {
            break;
          }

          final acknowledged =
              await _channel.invokeMethod<bool>(
                'acknowledgeTelecelMerchantBalanceObservation',
                <String, dynamic>{
                  'source_reference':
                      observation.sourceReference,
                },
              ) ??
              false;

          // Never advance past an accepted observation until native storage
          // confirms that this exact reference was removed.
          if (!acknowledged) {
            break;
          }
        }
      } while (_rerunRequested);
    } on PlatformException {
      // Native handoff unavailable or failed. Preserve the FIFO.
    } on MissingPluginException {
      // Non-Android/test environments have no native observation channel.
    } catch (_) {
      // Network/auth/backend failures are intentionally fail-closed.
      // Never ACK an observation whose acceptance is uncertain.
    } finally {
      _processing = false;
    }
  }

  static Future<List<_PendingTelecelMerchantBalanceObservation>>
      _readPending() async {
    final raw = await _channel.invokeMethod<List<dynamic>>(
      'getPendingTelecelMerchantBalanceObservations',
    );

    if (raw == null || raw.isEmpty) {
      return const [];
    }

    final parsed =
        <_PendingTelecelMerchantBalanceObservation>[];

    for (final item in raw) {
      if (item is! Map) {
        // A malformed native entry must not be skipped in favour of a newer
        // financial observation.
        return const [];
      }

      final observation =
          _PendingTelecelMerchantBalanceObservation
              .tryParse(
        Map<String, dynamic>.from(item),
      );

      if (observation == null) {
        return const [];
      }

      parsed.add(observation);
    }

    return parsed;
  }

  static Future<bool> _submit(
    _PendingTelecelMerchantBalanceObservation observation,
  ) async {
    String? installationId;

    if (observation.simIccid.isEmpty) {
      installationId =
          await StorageService.getOrCreateInstallationId();
    }

    final body = <String, dynamic>{
      'source_reference': observation.sourceReference,
      'observed_at': DateTime
          .fromMillisecondsSinceEpoch(
            observation.receivedAtMillis,
            isUtc: true,
          )
          .toIso8601String(),
      'merchant_account_balance':
          observation.merchantAccountBalance,
      'working_account_balance':
          observation.workingAccountBalance,
      'sim_slot': observation.simSlot,
      if (observation.simIccid.isNotEmpty)
        'sim_iccid': observation.simIccid,
      if (observation.simIccid.isEmpty) ...{
        'installation_id': installationId,
        'sim_subscription_id':
            observation.subscriptionId,
      },
    };

    final response = await ApiClient.instance.post(
      '/transactions/telecel-merchant/balance-observations',
      data: body,
    );

    if (response.statusCode != 200) {
      return false;
    }

    final payload = response.data;

    if (payload is! Map) {
      return false;
    }

    return payload['success'] == true;
  }
}

class _PendingTelecelMerchantBalanceObservation {
  const _PendingTelecelMerchantBalanceObservation({
    required this.sourceReference,
    required this.receivedAtMillis,
    required this.subscriptionId,
    required this.simSlot,
    required this.simIccid,
    required this.merchantAccountBalance,
    required this.workingAccountBalance,
  });

  final String sourceReference;
  final int receivedAtMillis;
  final int subscriptionId;
  final int simSlot;
  final String simIccid;
  final String merchantAccountBalance;
  final String workingAccountBalance;

  static _PendingTelecelMerchantBalanceObservation?
      tryParse(Map<String, dynamic> raw) {
    final sourceReference =
        raw['source_reference']?.toString().trim() ?? '';

    final receivedAtMillis =
        _integer(raw['received_at_millis']);

    final subscriptionId =
        _integer(raw['subscription_id']);

    final simSlot =
        _integer(raw['sim_slot']);

    final simIccid =
        raw['sim_iccid']?.toString().trim() ?? '';

    final merchantBalance =
        raw['merchant_account_balance']
                ?.toString()
                .trim() ??
            '';

    final workingBalance =
        raw['working_account_balance']
                ?.toString()
                .trim() ??
            '';

    if (!RegExp(r'^[a-f0-9]{64}$')
        .hasMatch(sourceReference)) {
      return null;
    }

    if (receivedAtMillis == null ||
        receivedAtMillis <= 0 ||
        subscriptionId == null ||
        subscriptionId < 0 ||
        simSlot == null ||
        simSlot < 0 ||
        !_validMoney(merchantBalance) ||
        !_validMoney(workingBalance)) {
      return null;
    }

    return _PendingTelecelMerchantBalanceObservation(
      sourceReference: sourceReference,
      receivedAtMillis: receivedAtMillis,
      subscriptionId: subscriptionId,
      simSlot: simSlot,
      simIccid: simIccid,
      merchantAccountBalance: merchantBalance,
      workingAccountBalance: workingBalance,
    );
  }

  static int? _integer(dynamic value) {
    if (value is int) return value;
    if (value is num && value == value.roundToDouble()) {
      return value.toInt();
    }
    return int.tryParse(value?.toString() ?? '');
  }

  static bool _validMoney(String value) {
    return RegExp(
      r'^(?:0|[1-9]\d*)(?:\.\d{1,2})?$',
    ).hasMatch(value);
  }
}
