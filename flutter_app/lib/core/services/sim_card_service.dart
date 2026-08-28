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

  // SIM discovery crosses the Flutter -> Android platform-channel boundary.
  // Home can ask for the same SIM information from several independent
  // loaders at almost the same time, so share one in-flight native lookup.
  //
  // A successful snapshot is kept only briefly. This is long enough for
  // adjacent Home/navigation work to avoid duplicate native calls, but short
  // enough that normal use quickly observes SIM insertion/removal changes.
  static const Duration _snapshotTtl = Duration(seconds: 2);
  static List<SimCard>? _snapshot;
  static DateTime? _snapshotExpiresAt;
  static Future<List<SimCard>>? _inFlightLookup;

  /// Get all active SIM cards with their network identification.
  ///
  /// [forceRefresh] bypasses the short-lived snapshot. Callers that are at
  /// the final money-moving verification boundary can therefore require a
  /// fresh Android observation instead of trusting a UI warm-path snapshot.
  static Future<List<SimCard>> getSimCards({
    bool forceRefresh = false,
  }) async {
    final now = DateTime.now();

    if (!forceRefresh &&
        _snapshot != null &&
        _snapshotExpiresAt != null &&
        now.isBefore(_snapshotExpiresAt!)) {
      return List<SimCard>.unmodifiable(_snapshot!);
    }

    // Security-sensitive callers explicitly asking for a fresh observation
    // must not join an ordinary Home/navigation lookup that may already be
    // in flight. Cross the Android boundary again for that verification.
    if (forceRefresh) {
      final sims = await _loadSimCardsFromAndroid();

      if (sims.isNotEmpty) {
        _snapshot = List<SimCard>.unmodifiable(sims);
        _snapshotExpiresAt = DateTime.now().add(_snapshotTtl);
      } else {
        invalidateSnapshot();
      }

      return List<SimCard>.unmodifiable(sims);
    }

    final inFlight = _inFlightLookup;

    if (inFlight != null) {
      return inFlight;
    }

    final lookup = _loadSimCardsFromAndroid();
    _inFlightLookup = lookup;

    try {
      final sims = await lookup;

      // Do not cache an empty observation. Several existing screens retry
      // SIM discovery after a short delay because Android can transiently
      // report no subscriptions while telephony state is settling.
      if (sims.isNotEmpty) {
        _snapshot = List<SimCard>.unmodifiable(sims);
        _snapshotExpiresAt = DateTime.now().add(_snapshotTtl);
      } else {
        invalidateSnapshot();
      }

      return List<SimCard>.unmodifiable(sims);
    } finally {
      if (identical(_inFlightLookup, lookup)) {
        _inFlightLookup = null;
      }
    }
  }

  static Future<List<SimCard>> _loadSimCardsFromAndroid() async {
    try {
      final result = await _channel.invokeMethod<List>('getSimCards');

      if (result == null) return const <SimCard>[];

      return result
          .map((e) => SimCard.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    } on PlatformException catch (e) {
      if (e.code == 'PERMISSION_DENIED') {
        throw SimPermissionException(
          'READ_PHONE_STATE permission required',
        );
      }

      return const <SimCard>[];
    }
  }

  /// Drop the warm UI snapshot after an explicit SIM-related change.
  static void invalidateSnapshot() {
    _snapshot = null;
    _snapshotExpiresAt = null;
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

  /// Return every detected SIM for one provider.
  ///
  /// A device may contain more than one SIM from the same network,
  /// and those SIMs can have different AgentPro roles such as
  /// Agent, EVD, Merchant or Subscriber.
  static Future<List<SimCard>> getSimsForProvider(
    String provider,
  ) async {
    final normalized = provider.trim().toLowerCase();
    final sims = await getSimCards();

    return sims.where((sim) => sim.network == normalized).toList()
      ..sort((a, b) => a.slot.compareTo(b.slot));
  }

  /// Return all supported SIMs grouped by provider.
  static Future<Map<String, List<SimCard>>> getProviderSimGroups() async {
    final sims = await getSimCards();

    final result = <String, List<SimCard>>{
      'mtn': <SimCard>[],
      'telecel': <SimCard>[],
      'at_money': <SimCard>[],
    };

    for (final sim in sims) {
      result[sim.network]?.add(sim);
    }

    for (final group in result.values) {
      group.sort((a, b) => a.slot.compareTo(b.slot));
    }

    return result;
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
      case 'mtn':
        return 'MTN Mobile Money';
      case 'telecel':
        return 'Telecel Cash';
      case 'at_money':
        return 'AT Money';
      default:
        return carrierName.isNotEmpty ? carrierName : 'Unknown Network';
    }
  }

  bool get isMoMoSupported => ['mtn', 'telecel', 'at_money'].contains(network);

  @override
  String toString() =>
      'SimCard(slot: $slot, network: $network, carrier: $carrierName)';
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
