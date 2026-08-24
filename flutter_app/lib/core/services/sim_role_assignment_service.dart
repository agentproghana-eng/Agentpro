import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../../shared/models/sim_role.dart';

class SimRoleAssignmentService {
  SimRoleAssignmentService._();

  // v1 was keyed only by SIM slot. It is intentionally never read because
  // a different physical SIM inserted into the same slot must not inherit
  // the previous SIM's operational role.
  static const _legacyCachePrefix = 'agentpro_sim_role_assignment_v1_';

  static const _cachePrefix = 'agentpro_sim_role_assignment_v2_';

  static String _legacyCacheKey(int slot) => '$_legacyCachePrefix$slot';

  static String _canonicalProvider(
    String? provider,
  ) =>
      provider?.trim().toLowerCase() ?? '';

  static String _normalizedIccid(
    String? simIccid,
  ) =>
      simIccid?.trim() ?? '';

  static String? _identityCacheKey({
    required int slot,
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) {
    final iccid = _normalizedIccid(simIccid);

    if (iccid.isNotEmpty) {
      return '${_cachePrefix}iccid:$iccid';
    }

    final normalizedProvider = _canonicalProvider(provider);

    if (simSubscriptionId == null ||
        simSubscriptionId < 0 ||
        normalizedProvider.isEmpty) {
      return null;
    }

    return '${_cachePrefix}unresolved:'
        '$normalizedProvider:'
        '$simSubscriptionId:'
        '$slot';
  }

  static Future<void> cacheRoleForSlot({
    required int slot,
    required String role,
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) async {
    final canonical = canonicalSimPurpose(role);

    if ({
          'agent',
          'subscriber',
          'evd',
          'merchant',
        }.contains(canonical) ==
        false) {
      return;
    }

    final prefs = await SharedPreferences.getInstance();

    // Remove the old unsafe slot-only value during normal use.
    await prefs.remove(
      _legacyCacheKey(slot),
    );

    final key = _identityCacheKey(
      slot: slot,
      simIccid: simIccid,
      simSubscriptionId: simSubscriptionId,
      provider: provider,
    );

    if (key == null) {
      return;
    }

    await prefs.setString(
      key,
      canonical,
    );
  }

  static Future<String?> cachedRoleForSlot(
    int slot, {
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) async {
    final key = _identityCacheKey(
      slot: slot,
      simIccid: simIccid,
      simSubscriptionId: simSubscriptionId,
      provider: provider,
    );

    if (key == null) {
      return null;
    }

    final prefs = await SharedPreferences.getInstance();

    final value = prefs.getString(key);

    final canonical = canonicalSimPurpose(value);

    return canonical.isEmpty ? null : canonical;
  }

  static Future<String?> roleForSlot(
    int slot, {
    bool refreshFromServer = true,
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) async {
    final trustedCached = await cachedRoleForSlot(
      slot,
      simIccid: simIccid,
      simSubscriptionId: simSubscriptionId,
      provider: provider,
    );

    if (refreshFromServer) {
      try {
        final response = await ApiClient.instance.get(
          '/user-sim-purposes',
        );

        final responseData = response.data;

        final data = responseData is Map ? responseData['data'] : null;

        if (data is List) {
          for (final item in data) {
            if (item is Map) {
              final rawSlot = item['sim_slot'];

              final parsedSlot = rawSlot is int
                  ? rawSlot
                  : int.tryParse(
                      rawSlot?.toString() ?? '',
                    );

              if (parsedSlot == slot) {
                final purpose = canonicalSimPurpose(
                  item['purpose']?.toString(),
                );

                if (purpose.isEmpty) {
                  return trustedCached;
                }

                final requestedProvider = _canonicalProvider(
                  provider,
                );

                final storedProvider = _canonicalProvider(
                  item['provider']?.toString(),
                );

                if (requestedProvider.isNotEmpty && storedProvider.isNotEmpty) {
                  if (requestedProvider == storedProvider) {
                    // Provider identity agrees.
                  } else {
                    return trustedCached;
                  }
                }

                final requestedIccid = _normalizedIccid(
                  simIccid,
                );

                final storedIccid = _normalizedIccid(
                  item['sim_iccid']?.toString(),
                );

                var serverIdentityTrusted = false;

                if (requestedIccid.isNotEmpty && storedIccid.isNotEmpty) {
                  if (requestedIccid == storedIccid) {
                    serverIdentityTrusted = true;
                  } else {
                    // Same slot, different physical
                    // SIM. Never inherit the old role.
                    return trustedCached;
                  }
                } else if (trustedCached == null) {
                  // Without an ICCID match, only an
                  // already identity-bound local
                  // assignment can establish trust.
                  return null;
                } else {
                  serverIdentityTrusted = true;
                }

                if (serverIdentityTrusted) {
                  await cacheRoleForSlot(
                    slot: slot,
                    role: purpose,
                    simIccid: simIccid,
                    simSubscriptionId: simSubscriptionId,
                    provider: provider,
                  );

                  return purpose;
                }
              }
            }
          }
        }
      } catch (_) {
        // Network/server failure falls through
        // to the last trusted identity-bound local assignment.
      }
    }

    return trustedCached;
  }

  static Future<String> businessRoleForSlot(
    int slot, {
    bool refreshFromServer = true,
    bool allowLegacyAgentFallback = true,
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) async {
    final purpose = await roleForSlot(
      slot,
      refreshFromServer: refreshFromServer,
      simIccid: simIccid,
      simSubscriptionId: simSubscriptionId,
      provider: provider,
    );

    switch (purpose) {
      case 'agent':
      case 'evd':
      case 'merchant':
        return purpose!;

      case 'subscriber':
        throw StateError(
          'Subscriber SIM cannot execute Business transactions.',
        );

      default:
        if (allowLegacyAgentFallback) {
          return 'agent';
        }

        throw StateError(
          'This SIM role could not be verified for the '
          'currently installed SIM. Open Settings > SIM Purpose, '
          'confirm this SIM role, save it, then try again.',
        );
    }
  }
}
