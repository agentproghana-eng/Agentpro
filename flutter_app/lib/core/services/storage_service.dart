import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

class StorageService {
  static late FlutterSecureStorage _storage;

  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUser = 'user_data';
  static const _keyBiometricEnabled = 'biometric_enabled';

  // In-memory cache avoids secure-storage reads on every API request.
  static String? _accessTokenCache;

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

  static Future<bool> isBiometricEnabled() async {
    final val = await _storage.read(key: _keyBiometricEnabled);
    return val == 'true';
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
  }

  /// Clears only the access token while preserving the refresh token,
  /// cached user, and device-authentication preference. This supports
  /// optional phone-authentication re-entry without revoking the trusted
  /// device's refresh token.
  static Future<void> clearAccessTokenOnly() async {
    _accessTokenCache = null;
    await _storage.delete(key: _keyAccessToken);
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

  static Future<void> clearAll() async => _storage.deleteAll();
}
