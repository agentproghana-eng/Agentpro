import 'permission_service.dart';
import 'sim_card_service.dart';

class TransactionDevicePreparation {
  final int? simSlot;
  final String? simIccid;
  final String? failureReason;
  final bool permissionPermanentlyDenied;

  const TransactionDevicePreparation.ready({
    required this.simSlot,
    required this.simIccid,
  })  : failureReason = null,
        permissionPermanentlyDenied = false;

  const TransactionDevicePreparation.failed(
    this.failureReason, {
    this.permissionPermanentlyDenied = false,
  })  : simSlot = null,
        simIccid = null;

  bool get isReady => simSlot != null && failureReason == null;
}

class TransactionDevicePreparationService {
  const TransactionDevicePreparationService._();

  static Future<TransactionDevicePreparation> prepare({
    required String provider,
    int? requestedSimSlot,
    String? requestedSimIccid,
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

      // New transaction routes carry both slot and ICCID. When either
      // identifier is supplied, never silently substitute another SIM.
      if (requestedSimSlot != null || hasRequestedIccid) {
        for (final sim in providerSims) {
          final slotMatches =
              requestedSimSlot == null || sim.slot == requestedSimSlot;

          final iccidMatches =
              !hasRequestedIccid || sim.iccid == normalizedIccid;

          if (slotMatches && iccidMatches) {
            return TransactionDevicePreparation.ready(
              simSlot: sim.slot,
              simIccid: sim.iccid,
            );
          }
        }

        final expected = <String>[
          providerLabel(provider),
          if (requestedSimSlot != null) 'SIM ${requestedSimSlot + 1}',
        ].join(' ');

        return TransactionDevicePreparation.failed(
          'The selected $expected is no longer available. '
          'Reinsert the original SIM or return and select an available SIM.',
        );
      }

      // Legacy routes may not contain persisted SIM identity. They can
      // still use the detected provider SIM, but only after successful
      // detection. We never guess slot 0.
      final sim = providerSims.first;

      return TransactionDevicePreparation.ready(
        simSlot: sim.slot,
        simIccid: sim.iccid,
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
