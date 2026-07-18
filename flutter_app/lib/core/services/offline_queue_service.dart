import "dart:convert";
import "package:hive_flutter/hive_flutter.dart";
import "package:uuid/uuid.dart";
import "../api/api_client.dart";

/// Offline Transaction Queue - Pilot (single-dial transaction types only)
///
/// Stores fully-completed transactions (already dialed and resolved via
/// USSD) that could not be reported to the backend because the device
/// was offline at the time. Nothing about the actual dial changes here -
/// USSD dialing never needed internet in the first place. This queue only
/// covers the app own API calls (initiate + complete), which do need
/// connectivity.
///
/// Sync deliberately replays the existing two-step API (initiate, then
/// complete) rather than a bespoke sync endpoint - "complete" is called
/// immediately with the already-known result rather than waiting on a
/// real USSD response, since that already happened offline. This reuses
/// 100% of already-tested backend code with zero backend changes.
class OfflineQueueService {
  static const _boxName = "offline_transaction_queue";
  static const _templateBoxName = "cached_ussd_templates";

  static Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox(_boxName);
    await Hive.openBox(_templateBoxName);
  }

  static Box get _box => Hive.box(_boxName);
  static Box get _templateBox => Hive.box(_templateBoxName);

  static String _templateKey(String provider, String type) => "${provider}_$type";

  static Future<void> cacheTemplate(String provider, String transactionType, Map<String, dynamic> template) async {
    await _templateBox.put(_templateKey(provider, transactionType), jsonEncode(template));
  }

  static Map<String, dynamic>? getCachedTemplate(String provider, String transactionType) {
    final raw = _templateBox.get(_templateKey(provider, transactionType));
    if (raw == null) return null;
    return jsonDecode(raw as String) as Map<String, dynamic>;
  }

  static Future<String> queueTransaction({
    required Map<String, dynamic> requestFields,
    required String status,
    String? networkReference,
    String? failureReason,
    required List<Map<String, dynamic>> sessionLog,
  }) async {
    final localId = "local_${const Uuid().v4()}";
    await _box.put(localId, jsonEncode({
      "local_id": localId,
      "request_fields": requestFields,
      "status": status,
      "network_reference": networkReference,
      "failure_reason": failureReason,
      "session_log": sessionLog,
      "queued_at": DateTime.now().toIso8601String(),
      "synced": false,
    }));
    return localId;
  }

  static List<Map<String, dynamic>> getPendingTransactions() {
    return _box.values
        .map((raw) => jsonDecode(raw as String) as Map<String, dynamic>)
        .where((tx) => tx["synced"] != true)
        .toList();
  }

  static int get pendingCount => getPendingTransactions().length;

  static Future<void> _markSynced(String localId) async {
    final raw = _box.get(localId);
    if (raw == null) return;
    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    tx["synced"] = true;
    await _box.put(localId, jsonEncode(tx));
  }

  static Future<Map<String, int>> syncNow() async {
    final pending = getPendingTransactions();
    var succeeded = 0;
    var failed = 0;

    for (final tx in pending) {
      try {
        final fields = Map<String, dynamic>.from(tx["request_fields"] as Map);
        final initiateRes = await ApiClient.instance.post("/transactions", data: fields);
        final transactionId = initiateRes.data["data"]["transaction_id"];

        await ApiClient.instance.patch("/transactions/$transactionId/complete", data: {
          "status": tx["status"],
          "network_reference": tx["network_reference"],
          "failure_reason": tx["failure_reason"],
          "ussd_session_log": tx["session_log"],
        });

        await _markSynced(tx["local_id"] as String);
        succeeded++;
      } catch (_) {
        failed++;
      }
    }

    return {"succeeded": succeeded, "failed": failed};
  }
}
