import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import 'sim_card_service.dart';
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

  static Future<List<dynamic>?> _fetchServerPurposes() async {
    try {
      final response = await ApiClient.instance.get(
        '/user-sim-purposes',
      );

      final responseData = response.data;
      final data =
          responseData is Map ? responseData['data'] : null;

      return data is List ? data : null;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> _resolveRole({
    required int slot,
    required String? trustedCached,
    required List<dynamic>? serverPurposes,
    String? simIccid,
    int? simSubscriptionId,
    String? provider,
  }) async {
    if (serverPurposes == null) {
      return trustedCached;
    }

    for (final item in serverPurposes) {
      if (item is! Map) {
        continue;
      }

      final rawSlot = item['sim_slot'];

      final parsedSlot = rawSlot is int
          ? rawSlot
          : int.tryParse(
              rawSlot?.toString() ?? '',
            );

      if (parsedSlot != slot) {
        continue;
      }

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

      if (requestedProvider.isNotEmpty &&
          storedProvider.isNotEmpty &&
          requestedProvider != storedProvider) {
        return trustedCached;
      }

      final requestedIccid = _normalizedIccid(
        simIccid,
      );

      final storedIccid = _normalizedIccid(
        item['sim_iccid']?.toString(),
      );

      var serverIdentityTrusted = false;

      if (requestedIccid.isNotEmpty &&
          storedIccid.isNotEmpty) {
        if (requestedIccid == storedIccid) {
          serverIdentityTrusted = true;
        } else {
          // Same slot, different physical SIM.
          // Never inherit the old role.
          return trustedCached;
        }
      } else if (trustedCached == null) {
        // Without an ICCID match, only an already identity-bound local
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

    return trustedCached;
  }

  /// Resolve roles for several physical SIMs using a single server request.
  ///
  /// This is intentionally request-scoped rather than stored in a global
  /// response cache: /user-sim-purposes belongs to the current authenticated
  /// user, so its response must never survive into another account/session.
  static Future<Map<int, String>> rolesForSims(
    Iterable<SimCard> sims, {
    bool refreshFromServer = true,
  }) async {
    final simList = sims.toList();

    final cachedRoles = <int, String?>{};

    await Future.wait(
      simList.map(
        (sim) async {
          cachedRoles[sim.slot] = await cachedRoleForSlot(
            sim.slot,
            simIccid: sim.iccid,
            simSubscriptionId: sim.subscriptionId,
            provider: sim.network,
          );
        },
      ),
    );

    final serverPurposes =
        refreshFromServer ? await _fetchServerPurposes() : null;

    final resolved = <int, String>{};

    for (final sim in simList) {
      final role = await _resolveRole(
        slot: sim.slot,
        trustedCached: cachedRoles[sim.slot],
        serverPurposes: serverPurposes,
        simIccid: sim.iccid,
        simSubscriptionId: sim.subscriptionId,
        provider: sim.network,
      );

      if (role != null) {
        resolved[sim.slot] = role;
      }
    }

    return resolved;
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

    final serverPurposes =
        refreshFromServer ? await _fetchServerPurposes() : null;

    return _resolveRole(
      slot: slot,
      trustedCached: trustedCached,
      serverPurposes: serverPurposes,
      simIccid: simIccid,
      simSubscriptionId: simSubscriptionId,
      provider: provider,
    );
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
