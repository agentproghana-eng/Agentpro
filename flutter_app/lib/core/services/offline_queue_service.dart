import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import 'storage_service.dart';

class OfflineQueueIdentity {
  final String userId;
  final String? companyId;

  const OfflineQueueIdentity({required this.userId, this.companyId});

  String get queueScopeKey => '$userId|${companyId ?? '-'}';
}

class OfflineQueueService {
  static const _legacyBoxName = 'offline_transaction_queue';
  static const _legacyTemplateBoxName = 'cached_ussd_templates';

  static const _boxName = 'offline_transaction_queue_v2';
  static const _templateBoxName = 'cached_ussd_templates_v2';

  static const _metadataBoxName = 'offline_storage_metadata_v2';
  static const _metadataKeyFingerprint = 'key_fingerprint_sha256';

  static const int _maxSyncAttempts = 10;

  static final Map<String, Future<Map<String, int>>> _activeSyncs = {};
  static Future<void>? _initialization;

  static Future<void> init() async {
    final existing = _initialization;

    if (existing != null) {
      await existing;

      if (Hive.isBoxOpen(_boxName) && Hive.isBoxOpen(_templateBoxName)) {
        return;
      }
    }

    final future = _initialize();
    _initialization = future;

    try {
      await future;
    } catch (_) {
      if (identical(_initialization, future)) {
        _initialization = null;
      }
      rethrow;
    }
  }

  static Future<void> _initialize() async {
    await Hive.initFlutter();

    final encryptionKey = await _loadOrCreateEncryptionKey();

    await _openEncryptedBoxesAndMigrate(encryptionKey);
  }

  static Future<List<int>> _loadOrCreateEncryptionKey() async {
    final stored = await StorageService.readOfflineQueueEncryptionKey();

    if (stored != null) {
      return stored;
    }

    final encryptedQueueExists = await Hive.boxExists(_boxName);

    final encryptedTemplateExists = await Hive.boxExists(_templateBoxName);

    if (encryptedQueueExists || encryptedTemplateExists) {
      throw StateError(
        'Encrypted offline data exists but its secure-storage key is missing.',
      );
    }

    final generated = Hive.generateSecureKey();

    await StorageService.writeOfflineQueueEncryptionKey(generated);

    return generated;
  }

  static Future<void> initializeWithKeyForTesting(
    List<int> encryptionKey,
  ) async {
    await _openEncryptedBoxesAndMigrate(encryptionKey);
  }

  static Future<void> _openEncryptedBoxesAndMigrate(
    List<int> encryptionKey,
  ) async {
    if (encryptionKey.length != 32) {
      throw ArgumentError.value(
        encryptionKey.length,
        'encryptionKey.length',
        'Hive AES keys must contain exactly 32 bytes.',
      );
    }

    await _verifyEncryptionKeyBeforeOpen(
      encryptionKey,
    );

    if (!Hive.isBoxOpen(_boxName)) {
      await Hive.openBox(
        _boxName,
        encryptionCipher: HiveAesCipher(encryptionKey),
      );
    }

    if (!Hive.isBoxOpen(_templateBoxName)) {
      await Hive.openBox(
        _templateBoxName,
        encryptionCipher: HiveAesCipher(encryptionKey),
      );
    }

    await _migrateLegacyBox(legacyName: _legacyBoxName, encryptedTarget: _box);

    await _migrateLegacyBox(
      legacyName: _legacyTemplateBoxName,
      encryptedTarget: _templateBox,
    );
  }

  static Future<void> _verifyEncryptionKeyBeforeOpen(
    List<int> encryptionKey,
  ) async {
    final queueExists = await Hive.boxExists(_boxName);

    final templateExists = await Hive.boxExists(_templateBoxName);

    final encryptedStorageExists = queueExists || templateExists;

    final fingerprint = sha256.convert(encryptionKey).toString();

    final metadata = Hive.isBoxOpen(_metadataBoxName)
        ? Hive.box(_metadataBoxName)
        : await Hive.openBox(
            _metadataBoxName,
          );

    try {
      final stored = metadata.get(_metadataKeyFingerprint)?.toString().trim();

      if (encryptedStorageExists) {
        if (stored == null || stored.isEmpty) {
          throw StateError(
            'Encrypted offline data exists but its key fingerprint is missing.',
          );
        }

        if (stored != fingerprint) {
          throw StateError(
            'Offline storage encryption key does not match existing encrypted data.',
          );
        }

        return;
      }

      await metadata.put(
        _metadataKeyFingerprint,
        fingerprint,
      );

      await metadata.flush();
    } finally {
      if (Hive.isBoxOpen(_metadataBoxName)) {
        await Hive.box(
          _metadataBoxName,
        ).close();
      }
    }
  }

  static Future<void> _migrateLegacyBox({
    required String legacyName,
    required Box encryptedTarget,
  }) async {
    if (!await Hive.boxExists(legacyName)) {
      return;
    }

    final legacy = Hive.isBoxOpen(legacyName)
        ? Hive.box(legacyName)
        : await Hive.openBox(legacyName);

    try {
      final entries = <dynamic, dynamic>{};

      for (final key in legacy.keys) {
        entries[key] = legacy.get(key);
      }

      if (entries.isNotEmpty) {
        await encryptedTarget.putAll(entries);

        await encryptedTarget.flush();

        for (final entry in entries.entries) {
          if (encryptedTarget.get(entry.key) != entry.value) {
            throw StateError(
              'Offline storage migration verification failed for $legacyName.',
            );
          }
        }
      }
    } finally {
      if (Hive.isBoxOpen(legacyName)) {
        await Hive.box(legacyName).close();
      }
    }

    await Hive.deleteBoxFromDisk(legacyName);
  }

  static Box get _box => Hive.box(_boxName);
  static Box get _templateBox => Hive.box(_templateBoxName);

  static OfflineQueueIdentity? identityFromUser(Map<String, dynamic>? user) {
    if (user == null) return null;

    final userId = user['id']?.toString().trim() ?? '';
    if (userId.isEmpty) return null;

    final rawCompanyId = user['company_id']?.toString().trim();
    final companyId =
        rawCompanyId == null || rawCompanyId.isEmpty ? null : rawCompanyId;

    return OfflineQueueIdentity(userId: userId, companyId: companyId);
  }

  static String? _cacheOwner(
    OfflineQueueIdentity identity, {
    required bool isPersonal,
  }) {
    if (isPersonal) {
      return 'user:${identity.userId}';
    }

    final companyId = identity.companyId;
    if (companyId == null || companyId.isEmpty) {
      return null;
    }

    return 'company:$companyId';
  }

  static String? _templateKey(
    OfflineQueueIdentity identity,
    String provider,
    String type,
  ) {
    final owner = _cacheOwner(identity, isPersonal: false);
    if (owner == null) return null;

    return ['template', owner, provider, type].join('_');
  }

  static Future<void> cacheTemplate(
    String provider,
    String transactionType,
    Map<String, dynamic> template, {
    required OfflineQueueIdentity identity,
  }) async {
    final key = _templateKey(identity, provider, transactionType);
    if (key == null) return;

    await _templateBox.put(key, jsonEncode(template));
  }

  static Map<String, dynamic>? getCachedTemplate(
    String provider,
    String transactionType, {
    required OfflineQueueIdentity identity,
  }) {
    final key = _templateKey(identity, provider, transactionType);
    if (key == null) return null;

    final raw = _templateBox.get(key);
    if (raw == null) return null;
    return jsonDecode(raw as String) as Map<String, dynamic>;
  }

  static String? _flowKey(
    OfflineQueueIdentity identity,
    String provider,
    String type, {
    required bool isPersonal,
    String? bundleCategory,
    String? recipientMode,
  }) {
    final bundle = (bundleCategory ?? '').trim();
    final recipient = (recipientMode ?? '').trim();
    final owner = _cacheOwner(identity, isPersonal: isPersonal);

    if (owner == null) return null;

    return [
      'flow',
      owner,
      isPersonal ? 'personal' : 'business',
      provider,
      type,
      bundle.isEmpty ? '-' : bundle,
      recipient.isEmpty ? '-' : recipient,
    ].join('_');
  }

  // Caches the Flow Builder resolve() result. Identity is part of the key:
  // Personal overrides belong to one user, while Business overrides belong
  // to one company. Legacy device-global keys are intentionally not read.
  static Future<void> cacheFlow(
    String provider,
    String transactionType,
    Map<String, dynamic> flow, {
    required OfflineQueueIdentity identity,
    bool isPersonal = false,
    String? bundleCategory,
    String? recipientMode,
  }) async {
    final key = _flowKey(
      identity,
      provider,
      transactionType,
      isPersonal: isPersonal,
      bundleCategory: bundleCategory,
      recipientMode: recipientMode,
    );

    if (key == null) return;

    await _templateBox.put(key, jsonEncode(flow));
  }

  static Map<String, dynamic>? getCachedFlow(
    String provider,
    String transactionType, {
    required OfflineQueueIdentity identity,
    bool isPersonal = false,
    String? bundleCategory,
    String? recipientMode,
  }) {
    final key = _flowKey(
      identity,
      provider,
      transactionType,
      isPersonal: isPersonal,
      bundleCategory: bundleCategory,
      recipientMode: recipientMode,
    );

    if (key == null) return null;

    final raw = _templateBox.get(key);

    if (raw == null) return null;

    return jsonDecode(raw as String) as Map<String, dynamic>;
  }

  static Future<void> deleteCachedFlow(
    String provider,
    String transactionType, {
    required OfflineQueueIdentity identity,
    bool isPersonal = false,
    String? bundleCategory,
    String? recipientMode,
  }) async {
    final key = _flowKey(
      identity,
      provider,
      transactionType,
      isPersonal: isPersonal,
      bundleCategory: bundleCategory,
      recipientMode: recipientMode,
    );

    if (key == null) return;

    await _templateBox.delete(key);
  }

  static Future<String> queueTransaction({
    required OfflineQueueIdentity identity,
    required Map<String, dynamic> requestFields,
    required String status,
    String? networkReference,
    String? failureReason,
    required List<Map<String, dynamic>> sessionLog,
    bool isPersonal = false,
  }) async {
    if (!isPersonal && identity.companyId == null) {
      throw StateError(
        'Business offline transactions require a company identity.',
      );
    }

    final localId = 'local_${const Uuid().v4()}';
    await _box.put(
      localId,
      jsonEncode({
        'local_id': localId,
        'owner_user_id': identity.userId,
        'owner_company_id': isPersonal ? null : identity.companyId,
        'request_fields': requestFields,
        'provider': requestFields['provider'],
        'sim_slot': requestFields['sim_slot'],
        'sim_iccid': requestFields['sim_iccid'],
        'installation_id': requestFields['installation_id'],
        'sim_subscription_id': requestFields['sim_subscription_id'],
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

  static String? _normalizeOwnerValue(dynamic value) {
    final normalized = value?.toString().trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  static bool _belongsToIdentity(
    Map<String, dynamic> transaction,
    OfflineQueueIdentity identity,
  ) {
    final ownerUserId = _normalizeOwnerValue(transaction['owner_user_id']);

    // Legacy records created before identity scoping are deliberately
    // quarantined. There is no safe way to infer which account owned them.
    if (ownerUserId == null || ownerUserId != identity.userId) {
      return false;
    }

    final isPersonal = transaction['is_personal'] == true;
    final ownerCompanyId = _normalizeOwnerValue(
      transaction['owner_company_id'],
    );

    if (isPersonal) {
      return ownerCompanyId == null;
    }

    final companyId = identity.companyId;
    if (companyId == null || ownerCompanyId == null) {
      return false;
    }

    return ownerCompanyId == companyId;
  }

  static List<Map<String, dynamic>> getPendingTransactions(
    OfflineQueueIdentity identity,
  ) {
    final transactions = _box.values
        .map((raw) => jsonDecode(raw as String) as Map<String, dynamic>)
        .where(
          (tx) =>
              tx['synced'] != true &&
              tx['dead_letter'] != true &&
              _belongsToIdentity(tx, identity),
        )
        .toList();

    transactions.sort((a, b) {
      final aQueued = DateTime.tryParse(a['queued_at']?.toString() ?? '');
      final bQueued = DateTime.tryParse(b['queued_at']?.toString() ?? '');

      if (aQueued == null && bQueued == null) return 0;
      if (aQueued == null) return 1;
      if (bQueued == null) return -1;

      return aQueued.compareTo(bQueued);
    });

    return transactions;
  }

  static int pendingCount(OfflineQueueIdentity identity) =>
      getPendingTransactions(identity).length;

  static int pendingCountForUser(Map<String, dynamic> user) {
    final identity = identityFromUser(user);
    return identity == null ? 0 : pendingCount(identity);
  }

  static String providerLabel(String? provider) {
    return switch (provider) {
      'mtn' => 'MTN',
      'telecel' => 'Telecel',
      'at_money' => 'AT Money',
      _ => provider?.toUpperCase() ?? 'Unknown',
    };
  }

  static String simLabel(Map<String, dynamic> transaction) {
    final requestFields = transaction['request_fields'];

    dynamic rawProvider = transaction['provider'];
    dynamic rawSlot = transaction['sim_slot'];

    if (requestFields is Map) {
      rawProvider ??= requestFields['provider'];
      rawSlot ??= requestFields['sim_slot'];
    }

    final provider = rawProvider?.toString();
    final slot = rawSlot is num
        ? rawSlot.toInt()
        : int.tryParse(rawSlot?.toString() ?? '');

    final label = providerLabel(provider);

    if (slot == null) {
      return label;
    }

    return '$label SIM ${slot + 1}';
  }

  static Future<void> _markSynced(String localId) async {
    final raw = _box.get(localId);
    if (raw == null) return;
    final tx = jsonDecode(raw as String) as Map<String, dynamic>;
    tx['synced'] = true;
    await _box.put(localId, jsonEncode(tx));
  }

  static Future<Map<String, int>> syncNow(OfflineQueueIdentity identity) {
    final syncKey = identity.queueScopeKey;
    final existingSync = _activeSyncs[syncKey];

    if (existingSync != null) {
      return existingSync;
    }

    final sync = _performSync(identity);
    _activeSyncs[syncKey] = sync;

    return sync.whenComplete(() {
      if (identical(_activeSyncs[syncKey], sync)) {
        _activeSyncs.remove(syncKey);
      }
    });
  }

  static Future<Map<String, int>> _performSync(
    OfflineQueueIdentity identity,
  ) async {
    final pending = getPendingTransactions(identity);
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
        await _recordSyncFailure(localId, error.toString());
        failed++;
      }
    }

    return {'succeeded': succeeded, 'failed': failed};
  }

  static Future<void> _recordSyncFailure(String localId, String error) async {
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
    required OfflineQueueIdentity identity,
    required String transactionId,
    required String status,
    String? networkReference,
    String? failureReason,
    required List<Map<String, dynamic>> sessionLog,
    bool isPersonal = false,
  }) async {
    if (!isPersonal && identity.companyId == null) {
      throw StateError(
        'Business offline transactions require a company identity.',
      );
    }

    final localId = 'local_${const Uuid().v4()}';
    await _box.put(
      localId,
      jsonEncode({
        'local_id': localId,
        'owner_user_id': identity.userId,
        'owner_company_id': isPersonal ? null : identity.companyId,
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
