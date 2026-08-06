import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';
import '../api/api_client.dart';

class OfflineQueueService {
  static const _boxName = 'offline_transaction_queue';
  static const _templateBoxName = 'cached_ussd_templates';
  static const int _maxSyncAttempts = 10;

  static Future<Map<String, int>>? _activeSync;

  static Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox(_boxName);
    await Hive.openBox(_templateBoxName);
  }

  static Box get _box => Hive.box(_boxName);
  static Box get _templateBox => Hive.box(_templateBoxName);

  static String _templateKey(String provider, String type) =>
      '${provider}_$type';

  static Future<void> cacheTemplate(
    String provider,
    String transactionType,
    Map<String, dynamic> template,
  ) async {
    await _templateBox.put(
      _templateKey(provider, transactionType),
      jsonEncode(template),
    );
  }

  static Map<String, dynamic>? getCachedTemplate(
    String provider,
    String transactionType,
  ) {
    final raw = _templateBox.get(_templateKey(provider, transactionType));
    if (raw == null) return null;
    return jsonDecode(raw as String) as Map<String, dynamic>;
  }

  static String _flowKey(String provider, String type) =>
      'flow_${provider}_$type';

  // Caches the Flow Builder resolve() result (dial_code, steps,
  // success/failure markers) - the actual automation source for any
  // provider/type combo that's been migrated off the legacy
  // ussd_templates table. The transaction-create response never
  // includes this; only GET /ussd-flows/resolve does, which itself
  // needs connectivity, so it's cached here the moment it's fetched
  // online so a later offline attempt has something to use.
  static Future<void> cacheFlow(
    String provider,
    String transactionType,
    Map<String, dynamic> flow,
  ) async {
    await _templateBox.put(
      _flowKey(provider, transactionType),
      jsonEncode(flow),
    );
  }

  static Map<String, dynamic>? getCachedFlow(
    String provider,
    String transactionType,
  ) {
    final raw = _templateBox.get(_flowKey(provider, transactionType));
    if (raw == null) return null;
    return jsonDecode(raw as String) as Map<String, dynamic>;
  }

  static Future<String> queueTransaction({
    required Map<String, dynamic> requestFields,
    required String status,
    String? networkReference,
    String? failureReason,
    required List<Map<String, dynamic>> sessionLog,
    bool isPersonal = false,
  }) async {
    final localId = 'local_${const Uuid().v4()}';
    await _box.put(
      localId,
      jsonEncode({
        'local_id': localId,
        'request_fields': requestFields,
        'status': status,
        'network_reference': networkReference,
        'failure_reason': failureReason,
        'session_log': sessionLog,
        'is_personal': isPersonal,
        'queued_at': DateTime.now().toIso8601String(),
        'retry_count': 0,
        'last_attempt_at': null,
        'last_error': null,
        'dead_letter': false,
        'synced': false,
      }),
    );
    return localId;
  }

  static List<Map<String, dynamic>> getPendingTransactions() {
    final transactions = _box.values
        .map(
          (raw) => jsonDecode(raw as String) as Map<String, dynamic>,
        )
        .where(
          (tx) => tx['synced'] != true && tx['dead_letter'] != true,
        )
        .toList();

    transactions.sort((a, b) {
      final aQueued = DateTime.tryParse(
        a['queued_at']?.toString() ?? '',
      );
      final bQueued = DateTime.tryParse(
        b['queued_at']?.toString() ?? '',
      );

      if (aQueued == null && bQueued == null) return 0;
      if (aQueued == null) return 1;
      if (bQueued == null) return -1;

      return aQueued.compareTo(bQueued);
    });

    return transactions;
  }

  static int get pendingCount => getPendingTransactions().length;

  static Future<void> _markSynced(String localId) async {
    final raw = _box.get(localId);
    if (raw == null) return;
    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    tx['synced'] = true;
    await _box.put(localId, jsonEncode(tx));
  }

  static Future<Map<String, int>> syncNow() {
    final existingSync = _activeSync;

    if (existingSync != null) {
      return existingSync;
    }

    final sync = _performSync();
    _activeSync = sync;

    return sync.whenComplete(() {
      if (identical(_activeSync, sync)) {
        _activeSync = null;
      }
    });
  }

  static Future<Map<String, int>> _performSync() async {
    final pending = getPendingTransactions();
    var succeeded = 0;
    var failed = 0;

    for (final tx in pending) {
      final localId = tx['local_id'] as String;
      try {
        String transactionId;
        final existingRemoteId = tx['remote_transaction_id'] as String?;
        final isPersonal = tx['is_personal'] == true;
        final basePath =
            isPersonal ? '/personal-transactions' : '/transactions';

        if (existingRemoteId != null) {
          transactionId = existingRemoteId;
        } else {
          final fields = Map<String, dynamic>.from(tx['request_fields'] as Map);
          final initiateRes = await ApiClient.instance.post(
            basePath,
            data: fields,
          );
          transactionId = initiateRes.data['data']['transaction_id'] as String;
          await _saveRemoteId(localId, transactionId);
        }

        await ApiClient.instance.patch(
          '$basePath/$transactionId/complete',
          data: {
            'status': tx['status'],
            'network_reference': tx['network_reference'],
            'failure_reason': tx['failure_reason'],
            'ussd_session_log': tx['session_log'],
          },
        );

        await _markSynced(localId);
        succeeded++;
      } catch (error) {
        await _recordSyncFailure(
          localId,
          error.toString(),
        );
        failed++;
      }
    }

    return {'succeeded': succeeded, 'failed': failed};
  }

  static Future<void> _recordSyncFailure(
    String localId,
    String error,
  ) async {
    final raw = _box.get(localId);
    if (raw == null) return;

    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    final retryCount = (tx['retry_count'] as num?)?.toInt() ?? 0;
    final nextRetryCount = retryCount + 1;

    tx['retry_count'] = nextRetryCount;
    tx['last_attempt_at'] = DateTime.now().toIso8601String();
    tx['last_error'] = error.length > 500 ? error.substring(0, 500) : error;
    tx['dead_letter'] = nextRetryCount >= _maxSyncAttempts;

    await _box.put(localId, jsonEncode(tx));
  }

  static Future<void> _saveRemoteId(
    String localId,
    String transactionId,
  ) async {
    final raw = _box.get(localId);
    if (raw == null) return;
    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    tx['remote_transaction_id'] = transactionId;
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
    bool isPersonal = false,
  }) async {
    final localId = 'local_${const Uuid().v4()}';
    await _box.put(
      localId,
      jsonEncode({
        'local_id': localId,
        'remote_transaction_id': transactionId,
        'status': status,
        'network_reference': networkReference,
        'failure_reason': failureReason,
        'session_log': sessionLog,
        'is_personal': isPersonal,
        'queued_at': DateTime.now().toIso8601String(),
        'retry_count': 0,
        'last_attempt_at': null,
        'last_error': null,
        'dead_letter': false,
        'synced': false,
      }),
    );
    return localId;
  }
}
