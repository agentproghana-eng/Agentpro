import 'package:flutter/services.dart';

/// SIM Card Detection Service
///
/// Detects installed SIM cards and identifies which Mobile Money
/// network (MTN, Telecel, AT) is on each SIM slot.
///
/// Used by the USSD engine to automatically route transactions
/// to the correct SIM without showing the Android SIM picker.
class SimCardService {
  static const _channel = MethodChannel('com.agentpro.ghana/sim');

  /// Get all active SIM cards with their network identification
  static Future<List<SimCard>> getSimCards() async {
    try {
      final result = await _channel.invokeMethod<List>('getSimCards');
      if (result == null) return [];
      return result
          .map((e) => SimCard.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    } on PlatformException catch (e) {
      if (e.code == 'PERMISSION_DENIED') {
        throw SimPermissionException('READ_PHONE_STATE permission required');
      }
      return [];
    }
  }

  /// Find which SIM slot a provider is on.
  /// Returns slot index (0 or 1), or 0 as fallback.
  static Future<int> getSlotForProvider(String provider) async {
    try {
      final result = await _channel.invokeMethod<int>(
        'getSimSlotForProvider',
        {'provider': provider},
      );
      return result ?? 0;
    } on PlatformException {
      return 0;
    }
  }

  /// Check if the device has a SIM for a specific provider.
  /// Throws [SimPermissionException] if READ_PHONE_STATE was denied —
  /// callers must distinguish "permission denied" from "no matching SIM",
  /// since they require different user-facing messages and remediation.
  static Future<bool> hasProviderSim(String provider) async {
    final sims = await getSimCards(); // propagates SimPermissionException
    return sims.any((s) => s.network == provider);
  }

  /// Get a summary of available networks for UI display
  static Future<Map<String, SimCard?>> getNetworkSimMap() async {
    final sims = await getSimCards();
    return {
      'mtn': sims.where((s) => s.network == 'mtn').firstOrNull,
      'telecel': sims.where((s) => s.network == 'telecel').firstOrNull,
      'at_money': sims.where((s) => s.network == 'at_money').firstOrNull,
    };
  }
}

class SimCard {
  final int slot;
  final int subscriptionId;
  final String carrierName;
  final String network; // 'mtn', 'telecel', 'at_money', 'unknown'
  final String operatorCode;
  // The physical SIM card's own serial number - not universally
  // available on every device/Android version, so this can be empty.
  // Used to detect when a different physical SIM is being used under
  // the same agent account than usual, not to identify the SIM's
  // phone number (which Android does not reliably expose).
  final String iccid;

  const SimCard({
    required this.slot,
    required this.subscriptionId,
    required this.carrierName,
    required this.network,
    required this.operatorCode,
    this.iccid = '',
  });

  factory SimCard.fromMap(Map<String, dynamic> map) {
    return SimCard(
      slot: map['slot'] as int? ?? 0,
      subscriptionId: map['subscription_id'] as int? ?? 0,
      carrierName: map['carrier_name'] as String? ?? '',
      network: map['network'] as String? ?? 'unknown',
      operatorCode: map['operator_code'] as String? ?? '',
      iccid: map['iccid'] as String? ?? '',
    );
  }

  String get displayName {
    switch (network) {
      case 'mtn': return 'MTN Mobile Money';
      case 'telecel': return 'Telecel Cash';
      case 'at_money': return 'AT Money';
      default: return carrierName.isNotEmpty ? carrierName : 'Unknown Network';
    }
  }

  bool get isMoMoSupported => ['mtn', 'telecel', 'at_money'].contains(network);

  @override
  String toString() => 'SimCard(slot: $slot, network: $network, carrier: $carrierName)';
}

class SimPermissionException implements Exception {
  final String message;
  SimPermissionException(this.message);
  @override
  String toString() => 'SimPermissionException: $message';
}

extension ListFirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
