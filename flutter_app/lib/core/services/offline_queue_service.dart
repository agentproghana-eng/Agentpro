import "dart:convert";
import "package:hive_flutter/hive_flutter.dart";
import "package:uuid/uuid.dart";
import "../api/api_client.dart";

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
      final localId = tx["local_id"] as String;
      try {
        String transactionId;
        final existingRemoteId = tx["remote_transaction_id"] as String?;

        if (existingRemoteId != null) {
          transactionId = existingRemoteId;
        } else {
          final fields = Map<String, dynamic>.from(tx["request_fields"] as Map);
          final initiateRes = await ApiClient.instance.post("/transactions", data: fields);
          transactionId = initiateRes.data["data"]["transaction_id"] as String;
          await _saveRemoteId(localId, transactionId);
        }

        await ApiClient.instance.patch("/transactions/$transactionId/complete", data: {
          "status": tx["status"],
          "network_reference": tx["network_reference"],
          "failure_reason": tx["failure_reason"],
          "ussd_session_log": tx["session_log"],
        });

        await _markSynced(localId);
        succeeded++;
      } catch (_) {
        failed++;
      }
    }

    return {"succeeded": succeeded, "failed": failed};
  }

  static Future<void> _saveRemoteId(String localId, String transactionId) async {
    final raw = _box.get(localId);
    if (raw == null) return;
    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    tx["remote_transaction_id"] = transactionId;
    await _box.put(localId, jsonEncode(tx));
  }

  /// Queue a completion sync for a transaction that already exists on
  /// the backend (created while online) but whose completion PATCH
  /// failed due to lost connectivity. Skips the POST step entirely on
  /// sync - remote_transaction_id is already known, so syncNow()'s
  /// existing existingRemoteId branch goes straight to the PATCH.
  static Future<String> queuePendingCompletion({
    required String transactionId,
    required String status,
    String? networkReference,
    String? failureReason,
    required List<Map<String, dynamic>> sessionLog,
  }) async {
    final localId = "local_${const Uuid().v4()}";
    await _box.put(localId, jsonEncode({
      "local_id": localId,
      "remote_transaction_id": transactionId,
      "status": status,
      "network_reference": networkReference,
      "failure_reason": failureReason,
      "session_log": sessionLog,
      "queued_at": DateTime.now().toIso8601String(),
      "synced": false,
    }));
    return localId;
  }
}
