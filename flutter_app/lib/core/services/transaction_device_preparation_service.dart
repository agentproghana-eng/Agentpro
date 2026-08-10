import 'permission_service.dart';
import 'sim_card_service.dart';

class TransactionDevicePreparation {
  final int? simSlot;
  final String? simIccid;
  final int? simSubscriptionId;
  final String? failureReason;
  final bool permissionPermanentlyDenied;

  const TransactionDevicePreparation.ready({
    required this.simSlot,
    required this.simIccid,
    required this.simSubscriptionId,
  })  : failureReason = null,
        permissionPermanentlyDenied = false;

  const TransactionDevicePreparation.failed(
    this.failureReason, {
    this.permissionPermanentlyDenied = false,
  })  : simSlot = null,
        simIccid = null,
        simSubscriptionId = null;

  bool get isReady => simSlot != null && failureReason == null;
}

class TransactionDevicePreparationService {
  const TransactionDevicePreparationService._();

  /// Selects the SIM that is allowed to perform this exact transaction.
  ///
  /// ICCID is authoritative when available. If Android cannot expose an
  /// ICCID, subscription ID + slot act only as an unresolved fallback
  /// observation. They must both still match before the transaction may dial.
  ///
  /// When no persisted identity is supplied, this preserves the legacy
  /// behavior of selecting the first detected SIM for the requested provider.
  static SimCard? selectMatchingSim({
    required List<SimCard> simCards,
    required String provider,
    int? requestedSimSlot,
    String? requestedSimIccid,
    int? requestedSimSubscriptionId,
  }) {
    final providerSims =
        simCards.where((sim) => sim.network == provider).toList();

    if (providerSims.isEmpty) return null;

    final normalizedIccid = requestedSimIccid?.trim();
    final hasRequestedIccid =
        normalizedIccid != null && normalizedIccid.isNotEmpty;
    final hasRequestedSubscriptionId = requestedSimSubscriptionId != null;

    final hasPersistedIdentity = requestedSimSlot != null ||
        hasRequestedIccid ||
        hasRequestedSubscriptionId;

    if (!hasPersistedIdentity) {
      return providerSims.first;
    }

    for (final sim in providerSims) {
      final slotMatches =
          requestedSimSlot == null || sim.slot == requestedSimSlot;

      final identityMatches = hasRequestedIccid
          ? sim.iccid == normalizedIccid
          : !hasRequestedSubscriptionId ||
              sim.subscriptionId == requestedSimSubscriptionId;

      if (slotMatches && identityMatches) {
        return sim;
      }
    }

    return null;
  }

  static Future<TransactionDevicePreparation> prepare({
    required String provider,
    int? requestedSimSlot,
    String? requestedSimIccid,
    int? requestedSimSubscriptionId,
    void Function(String message)? onStatus,
  }) async {
    onStatus?.call('Checking phone permissions...');

    PermissionResult permissionResult;

    try {
      permissionResult =
          await PermissionService.requestTelephonyPermissions().timeout(
        const Duration(seconds: 10),
      );
    } on Exception {
      return const TransactionDevicePreparation.failed(
        'Timed out checking phone permissions. Please try again.',
      );
    }

    if (permissionResult != PermissionResult.granted) {
      final permanentlyDenied =
          permissionResult == PermissionResult.permanentlyDenied;

      return TransactionDevicePreparation.failed(
        permanentlyDenied
            ? 'Phone permission was denied. Enable it in Settings '
                'to process transactions.'
            : 'Phone permission is required to process Mobile Money '
                'transactions.',
        permissionPermanentlyDenied: permanentlyDenied,
      );
    }

    onStatus?.call('Detecting SIM card...');

    try {
      final simCards = await SimCardService.getSimCards();

      final providerSims =
          simCards.where((sim) => sim.network == provider).toList();

      if (providerSims.isEmpty) {
        return TransactionDevicePreparation.failed(
          'No ${providerLabel(provider)} SIM card was detected '
          'on this device.',
        );
      }

      final normalizedIccid = requestedSimIccid?.trim();
      final hasRequestedIccid =
          normalizedIccid != null && normalizedIccid.isNotEmpty;
      final hasRequestedSubscriptionId = requestedSimSubscriptionId != null;

      final matchedSim = selectMatchingSim(
        simCards: simCards,
        provider: provider,
        requestedSimSlot: requestedSimSlot,
        requestedSimIccid: requestedSimIccid,
        requestedSimSubscriptionId: requestedSimSubscriptionId,
      );

      if (matchedSim != null) {
        return TransactionDevicePreparation.ready(
          simSlot: matchedSim.slot,
          simIccid: matchedSim.iccid,
          simSubscriptionId: matchedSim.subscriptionId,
        );
      }

      // A persisted identity was supplied but no currently installed SIM
      // matches it. Never substitute another SIM merely because it belongs
      // to the same provider or occupies the same slot.
      if (requestedSimSlot != null ||
          hasRequestedIccid ||
          hasRequestedSubscriptionId) {
        final expected = <String>[
          providerLabel(provider),
          if (requestedSimSlot != null) 'SIM ${requestedSimSlot + 1}',
        ].join(' ');

        return TransactionDevicePreparation.failed(
          'The selected $expected is no longer available. '
          'Reinsert the original SIM or return and select an available SIM.',
        );
      }

      // This is reachable only if provider SIM detection changed between
      // filtering and matching. Treat it as verification failure rather than
      // guessing a SIM.
      return const TransactionDevicePreparation.failed(
        'AgentPro could not verify the selected SIM card.',
      );
    } on SimPermissionException {
      return const TransactionDevicePreparation.failed(
        'Phone permission is required to detect SIM cards.',
        permissionPermanentlyDenied: true,
      );
    } catch (_) {
      return const TransactionDevicePreparation.failed(
        'AgentPro could not verify the selected SIM card. '
        'Please check the SIM and try again.',
      );
    }
  }

  static String providerLabel(String provider) {
    return switch (provider) {
      'mtn' => 'MTN',
      'telecel' => 'Telecel',
      'at_money' => 'AT Money',
      _ => provider.toUpperCase(),
    };
  }
}
