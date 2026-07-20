import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';

class StorageService {
  static late FlutterSecureStorage _storage;

  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUser = 'user_data';
  static const _keyBiometricEnabled = 'biometric_enabled';
  static const _keyPinHash = 'pin_hash';
  static const _keyPinSalt = 'pin_salt';

  static Future<void> init() async {
    _storage = const FlutterSecureStorage(
      aOptions: AndroidOptions(
        encryptedSharedPreferences: true,
        keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
        storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
      ),
    );
  }

  static Future<void> saveAccessToken(String token) =>
      _storage.write(key: _keyAccessToken, value: token);

  static Future<String?> getAccessToken() =>
      _storage.read(key: _keyAccessToken);

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

  // ── Offline PIN unlock ──────────────────────────────────────
  // The PIN unlocks a session already cached on this device - it is
  // NEVER sent to the server and never substitutes for the real
  // email/password login, which must succeed online at least once
  // before a PIN can be set. Stored as salt + SHA-256(salt + pin),
  // never as plaintext.

  static String _generateSalt() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Url.encode(bytes);
  }

  static String _hashPin(String pin, String salt) {
    final bytes = utf8.encode('$salt:$pin');
    return sha256.convert(bytes).toString();
  }

  static Future<void> savePin(String pin) async {
    final salt = _generateSalt();
    final hash = _hashPin(pin, salt);
    await _storage.write(key: _keyPinSalt, value: salt);
    await _storage.write(key: _keyPinHash, value: hash);
  }

  static Future<bool> verifyPin(String pin) async {
    final salt = await _storage.read(key: _keyPinSalt);
    final storedHash = await _storage.read(key: _keyPinHash);
    if (salt == null || storedHash == null) return false;
    return _hashPin(pin, salt) == storedHash;
  }

  static Future<bool> hasPinSet() async {
    final hash = await _storage.read(key: _keyPinHash);
    return hash != null;
  }

  static Future<void> clearPin() async {
    await _storage.delete(key: _keyPinSalt);
    await _storage.delete(key: _keyPinHash);
  }

  static Future<bool> isLoggedIn() async {
    final token = await getAccessToken();
    return token != null;
  }

  /// Clears session data (tokens, cached user) AND the PIN, since a PIN
  /// with nothing left to unlock is a security smell - especially on a
  /// shared device where a different person might log in next.
  /// Deliberately preserves biometric_enabled, a pure device
  /// preference, same as before.
  static Future<void> clearSession() async {
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
    await _storage.delete(key: _keyUser);
    await clearPin();
  }

  /// Clears only the access token, preserving refresh token, user
  /// data, AND the PIN/biometric settings - used for the soft-logout
  /// path (biometric-enabled or PIN-enabled device), where the local
  /// UI session ends but the device stays trusted to restore access
  /// instantly next time, without the backend logout call that would
  /// otherwise revoke the refresh token entirely.
  static Future<void> clearAccessTokenOnly() async {
    await _storage.delete(key: _keyAccessToken);
  }

  static Future<void> clearAll() async => _storage.deleteAll();
}
