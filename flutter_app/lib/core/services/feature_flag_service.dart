import '../api/api_client.dart';
import 'storage_service.dart';

Set<String>? normalizeDisabledTransactionTypes(dynamic raw) {
  if (raw is! List) {
    return null;
  }

  final normalized = <String>{};
  final keyPattern = RegExp(r'^[a-z0-9_]+:[a-z0-9_]+$');

  for (final value in raw) {
    if (value is! String) {
      return null;
    }

    final key = value.trim().toLowerCase();

    if (key.isEmpty ||
        key.length > 100 ||
        !keyPattern.hasMatch(key)) {
      return null;
    }

    normalized.add(key);
  }

  return normalized;
}

/// Reads AgentPro's transaction kill-switch state without weakening
/// existing offline behavior.
///
/// Online:
/// - attempts to refresh /users/me/feature-flags;
/// - only replaces the durable snapshot when the response is valid.
///
/// Offline or transient network failure:
/// - keeps using the last valid identity-scoped dashboard snapshot;
/// - absence of a prior snapshot does not disable existing offline support.
///
/// This service only decides whether a *future* transaction may start.
/// It does not alter, remove, or reinterpret transactions that already
/// executed and are waiting in the offline synchronization queue.
class FeatureFlagService {
  FeatureFlagService._();

  static Future<bool> isTransactionDisabled({
    required String provider,
    required String transactionType,
    required bool allowNetwork,
  }) async {
    final normalizedProvider = provider.trim().toLowerCase();
    final normalizedType = transactionType.trim().toLowerCase();

    if (normalizedProvider.isEmpty || normalizedType.isEmpty) {
      return false;
    }

    final key = '$normalizedProvider:$normalizedType';

    final user = await StorageService.getUser();

    if (user == null) {
      return false;
    }

    Set<String> cached = const <String>{};

    final durable =
        await StorageService.getOfflineDashboardSnapshot(user);

    final durableFlags = normalizeDisabledTransactionTypes(
      durable?['disabled_transaction_types'],
    );

    if (durableFlags != null) {
      cached = durableFlags;
    }

    if (!allowNetwork) {
      return cached.contains(key);
    }

    try {
      final response =
          await ApiClient.instance.get('/users/me/feature-flags');

      final data = response.data['data'];

      if (data is! Map) {
        return cached.contains(key);
      }

      final fresh = normalizeDisabledTransactionTypes(
        data['disabled_transaction_types'],
      );

      if (fresh == null) {
        return cached.contains(key);
      }

      await StorageService.mergeOfflineDashboardSnapshot(
        user,
        {
          'disabled_transaction_types':
              fresh.toList()..sort(),
        },
      );

      return fresh.contains(key);
    } catch (_) {
      // A network/config fetch problem must not erase the last valid
      // identity-scoped snapshot. Existing bounded offline operation
      // therefore continues exactly as before.
      return cached.contains(key);
    }
  }
}
