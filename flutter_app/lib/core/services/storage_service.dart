import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import 'device_clock_service.dart';

enum OfflineServerTrustStatus {
  valid,
  missing,
  expired,
  accountMismatch,
  sessionMismatch,
  modeMismatch,
  deviceRebooted,
  deviceClockUnavailable,
  clockRollbackDetected,
}

class OfflineServerTrustEvaluation {
  final OfflineServerTrustStatus status;
  final DateTime? trustedNow;
  final bool personalPaidEntitled;

  const OfflineServerTrustEvaluation({
    required this.status,
    this.trustedNow,
    this.personalPaidEntitled = false,
  });

  bool get isValid => status == OfflineServerTrustStatus.valid;

  bool get hasPersonalPaidEntitlement => isValid && personalPaidEntitled;
}

bool offlineTrustProofMatchesCurrentSession({
  required String proofUserId,
  required String proofSessionId,
  required String currentUserId,
  required String currentSessionId,
}) {
  final normalizedProofUser = proofUserId.trim();
  final normalizedProofSession = proofSessionId.trim();
  final normalizedCurrentUser = currentUserId.trim();
  final normalizedCurrentSession = currentSessionId.trim();

  return normalizedProofUser.isNotEmpty &&
      normalizedProofSession.isNotEmpty &&
      normalizedCurrentUser.isNotEmpty &&
      normalizedCurrentSession.isNotEmpty &&
      normalizedProofUser == normalizedCurrentUser &&
      normalizedProofSession == normalizedCurrentSession;
}

String? sessionIdFromAccessToken(String? token) {
  if (token == null || token.trim().isEmpty) {
    return null;
  }

  try {
    final parts = token.split('.');

    if (parts.length != 3) {
      return null;
    }

    final payloadBytes = base64Url.decode(base64Url.normalize(parts[1]));

    final decoded = jsonDecode(utf8.decode(payloadBytes));

    if (decoded is! Map) {
      return null;
    }

    final sessionId = decoded['session_id']?.toString().trim() ?? '';

    return sessionId.isEmpty ? null : sessionId;
  } catch (_) {
    return null;
  }
}

OfflineServerTrustEvaluation evaluateOfflineServerTrustRecord({
  required Map<String, dynamic> stored,
  required String currentUserId,
  required String currentSessionId,
  required bool isPersonal,
  required DeviceClockSnapshot clock,
  required DateTime wallNow,
}) {
  final version = int.tryParse(stored['version']?.toString() ?? '');

  if (version != 2) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.missing,
    );
  }

  final expectedMode = isPersonal ? 'personal' : 'business';

  final trustedMode = stored['mode']?.toString().trim() ?? '';

  if (trustedMode != expectedMode) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.modeMismatch,
    );
  }

  final trustedUserId = stored['user_id']?.toString().trim() ?? '';

  if (currentUserId.trim().isEmpty ||
      trustedUserId.isEmpty ||
      currentUserId.trim() != trustedUserId) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.accountMismatch,
    );
  }

  final trustedSessionId = stored['session_id']?.toString().trim() ?? '';

  if (currentSessionId.trim().isEmpty ||
      trustedSessionId.isEmpty ||
      currentSessionId.trim() != trustedSessionId) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.sessionMismatch,
    );
  }

  final verifiedAt = DateTime.tryParse(
    stored['server_verified_at']?.toString() ?? '',
  )?.toUtc();

  final authorizedUntil = DateTime.tryParse(
    stored['authorized_until']?.toString() ?? '',
  )?.toUtc();

  final verifiedElapsed = int.tryParse(
    stored['elapsed_realtime_ms']?.toString() ?? '',
  );

  final verifiedBoot = int.tryParse(stored['boot_count']?.toString() ?? '');

  if (verifiedAt == null ||
      authorizedUntil == null ||
      verifiedElapsed == null ||
      verifiedBoot == null ||
      verifiedElapsed < 0 ||
      verifiedBoot < 0 ||
      !authorizedUntil.isAfter(verifiedAt)) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.missing,
    );
  }

  if (clock.bootCount != verifiedBoot) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.deviceRebooted,
    );
  }

  if (clock.elapsedRealtimeMs < verifiedElapsed) {
    return const OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.clockRollbackDetected,
    );
  }

  final elapsedMs = clock.elapsedRealtimeMs - verifiedElapsed;

  final trustedNow = verifiedAt.add(Duration(milliseconds: elapsedMs));

  if (wallNow.toUtc().isBefore(
    trustedNow.subtract(StorageService._clockRollbackTolerance),
  )) {
    return OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.clockRollbackDetected,
      trustedNow: trustedNow,
    );
  }

  final window = isPersonal
      ? StorageService.personalOfflineTransactionTrustWindow
      : StorageService.businessOfflineTransactionTrustWindow;

  final windowExpiresAt = verifiedAt.add(window);

  if (!trustedNow.isBefore(windowExpiresAt) ||
      !trustedNow.isBefore(authorizedUntil)) {
    return OfflineServerTrustEvaluation(
      status: OfflineServerTrustStatus.expired,
      trustedNow: trustedNow,
    );
  }

  var personalPaidEntitled = false;

  if (isPersonal) {
    final paidFlag = stored['personal_paid'];

    final claimsPaid = paidFlag == true || paidFlag?.toString() == '1';

    if (claimsPaid) {
      final paidUntil = DateTime.tryParse(
        stored['personal_paid_until']?.toString() ?? '',
      )?.toUtc();

      personalPaidEntitled =
          paidUntil != null &&
          trustedNow.isBefore(paidUntil) &&
          !paidUntil.isAfter(authorizedUntil);
    }
  }

  return OfflineServerTrustEvaluation(
    status: OfflineServerTrustStatus.valid,
    trustedNow: trustedNow,
    personalPaidEntitled: personalPaidEntitled,
  );
}

class StorageService {
  static late FlutterSecureStorage _storage;

  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUser = 'user_data';
  static const _keyBiometricEnabled = 'biometric_enabled';
  static const _keySessionLocked = 'session_locked';
  static const _keyInstallationId = 'installation_id';
  static const _keyOfflineQueueEncryptionKey = 'offline_queue_hive_key_v1';

  static const _keyLegacyServerTrust = 'offline_server_trust_v1';
  static const _keyBusinessServerTrust = 'offline_server_trust_business_v2';
  static const _keyPersonalServerTrust = 'offline_server_trust_personal_v2';

  // Business sessions normally correspond to an active working
  // shift, so stale server authorization gets a shorter allowance.
  static const businessOfflineTransactionTrustWindow = Duration(hours: 12);

  // Personal users receive a slightly longer outage allowance while
  // still bounding stale subscription/session state to one day.
  static const personalOfflineTransactionTrustWindow = Duration(hours: 24);

  // Device wall-clock movement never extends trust. A large backward
  // discrepancy is also treated as a fail-closed security signal.
  static const _clockRollbackTolerance = Duration(minutes: 5);

  // In-memory caches avoid secure-storage reads on hot paths.
  static String? _accessTokenCache;
  static String? _installationIdCache;

  static final Map<String, Future<void>> _offlineDashboardWrites = {};

  static final Map<String, DateTime> _lastServerTrustPersistedServerAtByProof =
      {};

  static Future<void> init() async {
    _storage = const FlutterSecureStorage(
      aOptions: AndroidOptions(
        encryptedSharedPreferences: true,
        keyCipherAlgorithm:
            KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
        storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
      ),
    );
  }

  static Future<List<int>?> readOfflineQueueEncryptionKey() async {
    final encoded = await _storage.read(key: _keyOfflineQueueEncryptionKey);

    if (encoded == null || encoded.trim().isEmpty) {
      return null;
    }

    try {
      final key = base64Url.decode(encoded.trim());

      if (key.length != 32) {
        throw StateError('Offline queue encryption key has an invalid length.');
      }

      return key;
    } on FormatException {
      throw StateError('Offline queue encryption key is malformed.');
    }
  }

  static Future<void> writeOfflineQueueEncryptionKey(List<int> key) async {
    if (key.length != 32) {
      throw ArgumentError.value(
        key.length,
        'key.length',
        'Hive AES keys must contain exactly 32 bytes.',
      );
    }

    await _storage.write(
      key: _keyOfflineQueueEncryptionKey,
      value: base64UrlEncode(key),
    );
  }

  /// Returns the durable identifier for this AgentPro installation.
  ///
  /// It survives normal logout/login because [clearSession] only removes
  /// account/session data. It is intentionally installation-scoped rather
  /// than user-scoped and is used only as a fallback identity component
  /// when Android cannot expose a physical SIM's ICCID.
  static Future<String> getOrCreateInstallationId() async {
    if (_installationIdCache != null) {
      return _installationIdCache!;
    }

    final stored = await _storage.read(key: _keyInstallationId);
    if (stored != null && stored.trim().isNotEmpty) {
      _installationIdCache = stored.trim();
      return _installationIdCache!;
    }

    final generated = const Uuid().v4();
    await _storage.write(key: _keyInstallationId, value: generated);
    _installationIdCache = generated;
    return generated;
  }

  static Future<void> saveAccessToken(String token) async {
    _accessTokenCache = token;
    await _storage.write(key: _keyAccessToken, value: token);
  }

  static String? getCachedAccessToken() {
    return _accessTokenCache;
  }

  static Future<String?> getAccessToken() async {
    if (_accessTokenCache != null) {
      return _accessTokenCache;
    }

    _accessTokenCache = await _storage.read(key: _keyAccessToken);
    return _accessTokenCache;
  }

  static Future<void> saveRefreshToken(String token) =>
      _storage.write(key: _keyRefreshToken, value: token);

  static Future<String?> getRefreshToken() =>
      _storage.read(key: _keyRefreshToken);

  static Future<void> saveUser(Map<String, dynamic> user) =>
      _storage.write(key: _keyUser, value: jsonEncode(user));

  static Future<Map<String, dynamic>?> getUser() async {
    final raw = await _storage.read(key: _keyUser);
    if (raw == null) return null;
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  static Future<void> setBiometricEnabled(bool value) =>
      _storage.write(key: _keyBiometricEnabled, value: value.toString());

  static Future<bool?> getDeviceAuthPreference() async {
    final value = await _storage.read(key: _keyBiometricEnabled);

    if (value == 'true') {
      return true;
    }

    if (value == 'false') {
      return false;
    }

    return null;
  }

  static Future<bool> isBiometricEnabled() async {
    return await getDeviceAuthPreference() == true;
  }

  /// Marks whether the authenticated session is locally locked.
  ///
  /// This flag is device-local and is deliberately independent of the
  /// server refresh-token session. A successful phone-authentication
  /// challenge may clear this flag without making a network request.
  static Future<void> setSessionLocked(bool value) =>
      _storage.write(key: _keySessionLocked, value: value.toString());

  static Future<bool> isSessionLocked() async {
    final value = await _storage.read(key: _keySessionLocked);
    return value == 'true';
  }

  static String _serverTrustStorageKey(bool isPersonal) {
    return isPersonal ? _keyPersonalServerTrust : _keyBusinessServerTrust;
  }

  static Future<void> _clearServerTrust() async {
    _lastServerTrustPersistedServerAtByProof.clear();

    await Future.wait([
      _storage.delete(key: _keyLegacyServerTrust),
      _storage.delete(key: _keyBusinessServerTrust),
      _storage.delete(key: _keyPersonalServerTrust),
    ]);
  }

  static Future<String?> _currentSessionId() async {
    final token = getCachedAccessToken() ?? await getAccessToken();

    return sessionIdFromAccessToken(token);
  }

  /// Persists a server-issued v2 offline authorization proof only when
  /// the proof belongs to the exact account and durable session that are
  /// still current on this device when the response arrives.
  static Future<bool> markServerVerified({
    required String mode,
    required String serverUserId,
    required String serverSessionId,
    required DateTime serverVerifiedAt,
    required DateTime authorizedUntil,
    required bool personalPaid,
    DateTime? personalPaidUntil,
  }) async {
    try {
      final normalizedMode = mode.trim().toLowerCase();

      if (normalizedMode != 'business' && normalizedMode != 'personal') {
        return false;
      }

      final user = await getUser();

      final currentUserId = user?['id']?.toString().trim() ?? '';

      final currentSessionId = await _currentSessionId() ?? '';

      if (!offlineTrustProofMatchesCurrentSession(
        proofUserId: serverUserId,
        proofSessionId: serverSessionId,
        currentUserId: currentUserId,
        currentSessionId: currentSessionId,
      )) {
        return false;
      }

      final normalizedServerAt = serverVerifiedAt.toUtc();

      final normalizedAuthorizedUntil = authorizedUntil.toUtc();

      if (!normalizedAuthorizedUntil.isAfter(normalizedServerAt)) {
        return false;
      }

      DateTime? normalizedPaidUntil;

      if (normalizedMode == 'personal' && personalPaid) {
        if (personalPaidUntil == null) {
          return false;
        }

        normalizedPaidUntil = personalPaidUntil.toUtc();

        if (!normalizedPaidUntil.isAfter(normalizedServerAt) ||
            normalizedPaidUntil.isAfter(normalizedAuthorizedUntil)) {
          return false;
        }
      }

      final proofKey = [
        normalizedMode,
        serverUserId.trim(),
        serverSessionId.trim(),
        normalizedAuthorizedUntil.toIso8601String(),
        personalPaid ? 'paid' : 'not_paid',
        normalizedPaidUntil?.toIso8601String() ?? '-',
      ].join('|');

      final lastPersisted = _lastServerTrustPersistedServerAtByProof[proofKey];

      if (lastPersisted != null) {
        final delta = normalizedServerAt.difference(lastPersisted).abs();

        if (delta < const Duration(minutes: 1)) {
          return true;
        }
      }

      final clock = await DeviceClockService.snapshot();

      if (clock == null) {
        return false;
      }

      final isPersonal = normalizedMode == 'personal';

      final payload = <String, dynamic>{
        'version': 2,
        'mode': normalizedMode,
        'user_id': serverUserId.trim(),
        'session_id': serverSessionId.trim(),
        'server_verified_at': normalizedServerAt.toIso8601String(),
        'authorized_until': normalizedAuthorizedUntil.toIso8601String(),
        'elapsed_realtime_ms': clock.elapsedRealtimeMs,
        'boot_count': clock.bootCount,
        if (isPersonal) 'personal_paid': personalPaid,
        if (isPersonal && personalPaid && normalizedPaidUntil != null)
          'personal_paid_until': normalizedPaidUntil.toIso8601String(),
      };

      await _storage.write(
        key: _serverTrustStorageKey(isPersonal),
        value: jsonEncode(payload),
      );

      _lastServerTrustPersistedServerAtByProof[proofKey] = normalizedServerAt;

      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<OfflineServerTrustEvaluation> evaluateOfflineTransactionTrust({
    required bool isPersonal,
  }) async {
    final key = _serverTrustStorageKey(isPersonal);

    final raw = await _storage.read(key: key);

    if (raw == null || raw.trim().isEmpty) {
      return const OfflineServerTrustEvaluation(
        status: OfflineServerTrustStatus.missing,
      );
    }

    Map<String, dynamic> stored;

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map) {
        throw const FormatException();
      }

      stored = Map<String, dynamic>.from(decoded);
    } catch (_) {
      await _storage.delete(key: key);

      return const OfflineServerTrustEvaluation(
        status: OfflineServerTrustStatus.missing,
      );
    }

    final user = await getUser();

    final currentUserId = user?['id']?.toString().trim() ?? '';

    final currentSessionId = await _currentSessionId() ?? '';

    final clock = await DeviceClockService.snapshot();

    if (clock == null) {
      return const OfflineServerTrustEvaluation(
        status: OfflineServerTrustStatus.deviceClockUnavailable,
      );
    }

    final evaluation = evaluateOfflineServerTrustRecord(
      stored: stored,
      currentUserId: currentUserId,
      currentSessionId: currentSessionId,
      isPersonal: isPersonal,
      clock: clock,
      wallNow: DateTime.now().toUtc(),
    );

    if (evaluation.status == OfflineServerTrustStatus.missing) {
      await _storage.delete(key: key);
    }

    return evaluation;
  }

  static Future<bool> isLoggedIn() async {
    final token = await getAccessToken();
    return token != null;
  }

  /// Clears all session data while preserving the device-authentication
  /// preference, which is a device setting rather than account data.
  static Future<void> clearSession() async {
    _accessTokenCache = null;
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
    await _storage.delete(key: _keyUser);
    await _storage.delete(key: _keySessionLocked);
    await _clearServerTrust();
  }

  /// Clears only the access token while preserving the refresh token,
  /// cached user, and device-authentication preference.
  ///
  /// Inactivity locking intentionally does not use this method: retaining
  /// the encrypted access token allows phone-authenticated unlock to remain
  /// completely local and work without internet connectivity.
  static Future<void> clearAccessTokenOnly() async {
    _accessTokenCache = null;
    await _storage.delete(key: _keyAccessToken);
  }

  static String? _offlineDashboardStorageKey(Map<String, dynamic> user) {
    final userId = user['id']?.toString().trim() ?? '';

    if (userId.isEmpty) {
      return null;
    }

    final rawCompanyId = user['company_id']?.toString().trim();
    final companyId = rawCompanyId == null || rawCompanyId.isEmpty
        ? '-'
        : rawCompanyId;

    final encodedScope = base64Url
        .encode(utf8.encode('$userId|$companyId'))
        .replaceAll('=', '');

    return 'offline_dashboard_v1_$encodedScope';
  }

  static Future<Map<String, dynamic>?> getOfflineDashboardSnapshot(
    Map<String, dynamic> user,
  ) async {
    final key = _offlineDashboardStorageKey(user);
    if (key == null) return null;

    final raw = await _storage.read(key: key);
    if (raw == null || raw.isEmpty) return null;

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;

      return Map<String, dynamic>.from(decoded);
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic> _deepMergeOfflineDashboardMaps(
    Map<String, dynamic> current,
    Map<String, dynamic> patch,
  ) {
    final merged = Map<String, dynamic>.from(current);

    for (final entry in patch.entries) {
      final existing = merged[entry.key];
      final incoming = entry.value;

      if (existing is Map && incoming is Map) {
        merged[entry.key] = _deepMergeOfflineDashboardMaps(
          Map<String, dynamic>.from(existing),
          Map<String, dynamic>.from(incoming),
        );
      } else {
        merged[entry.key] = incoming;
      }
    }

    return merged;
  }

  static Future<void> mergeOfflineDashboardSnapshot(
    Map<String, dynamic> user,
    Map<String, dynamic> patch,
  ) async {
    final key = _offlineDashboardStorageKey(user);
    if (key == null || patch.isEmpty) return;

    final previous = _offlineDashboardWrites[key] ?? Future<void>.value();

    late final Future<void> current;

    current = previous.then((_) async {
      Map<String, dynamic> existing = {};

      final raw = await _storage.read(key: key);

      if (raw != null && raw.isNotEmpty) {
        try {
          final decoded = jsonDecode(raw);

          if (decoded is Map) {
            existing = Map<String, dynamic>.from(decoded);
          }
        } catch (_) {}
      }

      final merged = _deepMergeOfflineDashboardMaps(existing, patch);

      merged['last_verified_update_at'] = DateTime.now()
          .toUtc()
          .toIso8601String();

      await _storage.write(key: key, value: jsonEncode(merged));
    });

    _offlineDashboardWrites[key] = current;

    try {
      await current;
    } finally {
      if (identical(_offlineDashboardWrites[key], current)) {
        _offlineDashboardWrites.remove(key);
      }
    }
  }

  // ── "New" feature badges ───────────────────────────────────
  // Tracks which one-time "NEW" badges (in the More tabs) have already
  // been shown on this device, so a badge appears once and then
  // disappears for good - rather than the old approach of a hardcoded
  // isNew: true that never turned off no matter how many times it had
  // already been seen.

  static Future<bool> hasSeenFeature(String key) async {
    final val = await _storage.read(key: 'seen_feature_$key');
    return val == 'true';
  }

  static Future<void> markFeatureSeen(String key) =>
      _storage.write(key: 'seen_feature_$key', value: 'true');

  static Future<void> clearAll() async {
    _accessTokenCache = null;
    _installationIdCache = null;
    _offlineDashboardWrites.clear();
    _lastServerTrustPersistedServerAtByProof.clear();
    await _storage.deleteAll();
  }
}
