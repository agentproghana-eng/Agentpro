import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'zero_input_execution_gate.dart';
import 'zero_input_direct_execution_policy.dart';

/// One process-wide lease for a provider-owned zero-input USSD session.
///
/// Acquiring the lease is NOT authorization to dial. The caller must still
/// perform backend initiation and device/SIM checks before execution.
/// A pending or unreported outcome intentionally keeps the lease held.
class ZeroInputExecutionSession {
  ZeroInputExecutionSession._();

  static final ZeroInputExecutionGate _gate = ZeroInputExecutionGate();

  static bool get isActive => _gate.isBusy;

  static const _storage = FlutterSecureStorage();
  static const _unresolvedKey = 'zero_input_unresolved_v1';
  static const _identityKey = 'zero_input_recovery_identity_v1';

  // Stable, privacy-safe reason codes. No SIM, PIN, token or operation ID.
  static String? _lastPreparationFailureCode;
  static String? get lastPreparationFailureCode => _lastPreparationFailureCode;

  // Shared by checkpoint persistence and recovery validation.
  static final RegExp _operationUuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-'
    r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// Persist before backend initiation; existing or unreadable state blocks.
  /// An orphaned identity may belong to an earlier attempt: never overwrite it.
  static Future<bool> persistBeforeInitiation(String? token) async {
    _lastPreparationFailureCode = null;
    if (!ownsReservation(token)) {
      _lastPreparationFailureCode = 'lease_not_owned';
      return false;
    }
    try {
      if (await _storage.read(key: _unresolvedKey) != null) {
        _lastPreparationFailureCode = 'unresolved_execution';
        return false;
      }
      if (await _storage.read(key: _identityKey) != null) {
        _lastPreparationFailureCode = 'orphaned_recovery_identity';
        return false;
      }
      await _storage.write(key: _unresolvedKey, value: token!);
      if (await _storage.read(key: _unresolvedKey) != token ||
          !ownsReservation(token)) {
        _lastPreparationFailureCode = 'reservation_readback_mismatch';
        return false;
      }
      return true;
    } catch (_) {
      _lastPreparationFailureCode = 'secure_storage_error';
      return false;
    }
  }

  /// Read the reservation token, re-reading briefly when the platform storage
  /// returns nothing right after a verified write. Read-only: it never writes
  /// or recreates the token, so a genuinely missing reservation still fails.
  static Future<String?> _readUnresolvedTokenSettled() async {
    var value = await _storage.read(key: _unresolvedKey);
    for (var attempt = 0; value == null && attempt < 2; attempt++) {
      await Future<void>.delayed(const Duration(milliseconds: 150));
      value = await _storage.read(key: _unresolvedKey);
    }
    return value;
  }

  /// Save the operation identity before sending the backend POST.
  /// This does not authorize USSD or release the unresolved lock.
  /// Record the operation UUID before any backend POST. Only a matching
  /// in-process lease plus the previously persisted token may proceed.
  static Future<bool> recordOperationCheckpoint({
    required String? token,
    required String operationId,
    required String transactionType,
    required bool isPersonal,
  }) async {
    _lastPreparationFailureCode = null;
    if (!ownsReservation(token)) {
      _lastPreparationFailureCode = 'lease_not_owned';
      return false;
    }
    if (!_operationUuid.hasMatch(operationId)) {
      _lastPreparationFailureCode = 'invalid_operation_id';
      return false;
    }
    if (transactionType.isEmpty) {
      _lastPreparationFailureCode = 'missing_transaction_type';
      return false;
    }

    try {
      final stored = await _readUnresolvedTokenSettled();
      if (stored != token) {
        // Distinguish a missing value (a storage read that returned nothing)
        // from a different value (another writer replaced it).
        _lastPreparationFailureCode = stored == null
            ? 'unresolved_token_missing'
            : 'unresolved_token_mismatch';
        return false;
      }
      if (await _storage.read(key: _identityKey) != null) {
        _lastPreparationFailureCode = 'existing_recovery_identity';
        return false;
      }

      final encoded = jsonEncode(<String, dynamic>{
        'reservation_token': token,
        'client_operation_id': operationId,
        'transaction_type': transactionType,
        'account_mode': isPersonal ? 'personal' : 'business',
      });
      await _storage.write(key: _identityKey, value: encoded);

      // Keep explicit two-key readback assertions as fail-closed proof.
      final verified = await _storage.read(key: _identityKey) == encoded &&
          await _storage.read(key: _unresolvedKey) == token &&
          ownsReservation(token);
      if (!verified) {
        _lastPreparationFailureCode = 'checkpoint_readback_mismatch';
      }
      return verified;
    } catch (_) {
      _lastPreparationFailureCode = 'secure_storage_error';
      return false;
    }
  }

  /// Preserve the pre-POST operation UUID when the backend ID arrives.
  static Future<bool> recordBackendIdentity({
    required String? token,
    required String transactionId,
    required String transactionType,
    required bool isPersonal,
  }) async {
    if (!ownsReservation(token) ||
        transactionId.isEmpty ||
        transactionId.startsWith('local_')) {
      return false;
    }

    try {
      if (await _storage.read(key: _unresolvedKey) != token) {
        return false;
      }

      final existing = await _storage.read(key: _identityKey);
      if (existing == null) return false;
      final decoded = jsonDecode(existing);
      if (decoded is! Map ||
          decoded['reservation_token'] != token ||
          decoded['transaction_type'] != transactionType ||
          decoded['account_mode'] !=
              (isPersonal ? 'personal' : 'business')) {
        return false;
      }
      final operationId = decoded['client_operation_id'];
      if (operationId is! String || !_operationUuid.hasMatch(operationId)) {
        return false;
      }
      final previousId = decoded['transaction_id'];
      if (previousId is String &&
          previousId.isNotEmpty &&
          previousId != transactionId) {
        return false;
      }

      final encoded = jsonEncode(<String, dynamic>{
        'reservation_token': token,
        'client_operation_id': operationId,
        'transaction_id': transactionId,
        'transaction_type': transactionType,
        'account_mode': isPersonal ? 'personal' : 'business',
      });

      await _storage.write(key: _identityKey, value: encoded);

      return await _storage.read(key: _identityKey) == encoded &&
          await _storage.read(key: _unresolvedKey) == token &&
          ownsReservation(token);
    } catch (_) {
      return false;
    }
  }

  /// Read-only identity supporting both recovery stages.
  static Future<Map<String, String>?> readUnresolvedIdentity() async {
    try {
      final token = await _storage.read(key: _unresolvedKey);
      if (token == null || token.isEmpty) return null;

      final encoded = await _storage.read(key: _identityKey);
      if (encoded == null) return null;

      final decoded = jsonDecode(encoded);
      if (decoded is! Map ||
          decoded['reservation_token'] != token) {
        return null;
      }

      final id = decoded['transaction_id'];
      final operationId = decoded['client_operation_id'];
      final type = decoded['transaction_type'];
      final mode = decoded['account_mode'];

      if (type is! String ||
          type.isEmpty ||
          (mode != 'personal' && mode != 'business')) {
        return null;
      }

      final hasId = id is String &&
          id.isNotEmpty &&
          !id.startsWith('local_');

      final hasOperation =
          operationId is String && _operationUuid.hasMatch(operationId);

      if (!hasId && !hasOperation) return null;

      return <String, String>{
        if (hasId) 'transaction_id': id,
        if (hasOperation) 'client_operation_id': operationId,
        'transaction_type': type,
        'account_mode': mode as String,
      };
    } catch (_) {
      return null;
    }
  }

  /// Called ONLY after definitive backend completion was verified.
  static Future<bool> clearDurableReservation(String? token) async {
    if (!ownsReservation(token)) return false;
    try {
      if (await _storage.read(key: _unresolvedKey) != token) return false;
      final encoded = await _storage.read(key: _identityKey);
      if (encoded == null) return false;
      final dynamic decoded = jsonDecode(encoded);
      if (decoded is! Map || decoded['reservation_token'] != token) {
        return false;
      }
      // Never release a process lease until both deletes read back as empty.
      await _storage.delete(key: _identityKey);
      if (await _storage.read(key: _identityKey) != null) return false;
      await _storage.delete(key: _unresolvedKey);
      return await _storage.read(key: _unresolvedKey) == null &&
          ownsReservation(token);
    } catch (_) {
      return false;
    }
  }

  /// Abort is permitted only before backend initiation was attempted.
  /// A foreign or unparseable identity is never considered stale by guesswork.
  static Future<void> abandonDurableBeforeBackendInitiation(String? token) async {
    if (!ownsReservation(token)) return;
    try {
      final existing = await _storage.read(key: _unresolvedKey);
      if (existing != null && existing != token) return;
      if (existing == token) {
        final identity = await _storage.read(key: _identityKey);
        if (identity != null) {
          final dynamic decoded;
          try {
            decoded = jsonDecode(identity);
          } catch (_) {
            return;
          }
          if (decoded is! Map || decoded['reservation_token'] != token) {
            return;
          }
          await _storage.delete(key: _identityKey);
          if (await _storage.read(key: _identityKey) != null) return;
        }
        await _storage.delete(key: _unresolvedKey);
        if (await _storage.read(key: _unresolvedKey) != null) return;
      } else if (await _storage.read(key: _identityKey) != null) {
        // Preserve a pre-existing orphaned identity for verified recovery.
        return;
      }
      abandonBeforeBackendInitiation(token);
    } catch (_) {
      // Storage uncertain: retain the process lease and block duplicate starts.
    }
  }

  static String? _reservationOwner;

  static String _newReservationToken() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final suffix = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return 'zero_input_$suffix';
  }

  /// Reserve synchronously before initiating a backend transaction.
  /// A reservation does not grant permission to dial.
  static String? reserveForInitiation() {
    if (!_gate.tryAcquire()) return null;
    try {
      final token = _newReservationToken();
      _reservationOwner = token;
      return token;
    } catch (_) {
      _reservationOwner = null;
      _gate.release();
      return null;
    }
  }

  /// Release only a matching lease before backend initiation begins.
  /// Do not call for an attempted request or an uncertain provider result.
  static void abandonBeforeBackendInitiation(String? token) {
    if (!ownsReservation(token)) return;
    _reservationOwner = null;
    _gate.release();
  }

  static bool ownsReservation(String? token) =>
      token != null && _gate.isBusy && _reservationOwner == token;


  static bool tryBegin({
    required String transactionType,
    required bool quickActionRequested,
    required bool preflightApproved,
    required bool simIdentityVerified,
    required bool backendAuthorizationReady,
    String? reservationToken,
  }) {
    if (!ZeroInputDirectExecutionPolicy.supportedTypes
        .contains(transactionType)) return false;
    if (!quickActionRequested || !preflightApproved ||
        !simIdentityVerified || !backendAuthorizationReady) return false;
    if (!ownsReservation(reservationToken)) return false;
    return ZeroInputDirectExecutionPolicy.mayUseDirectRoute(
      transactionType: transactionType,
      quickActionRequested: quickActionRequested,
      zeroInputPreflightApproved: preflightApproved,
      simIdentityVerified: simIdentityVerified,
      backendAuthorizationReady: backendAuthorizationReady,
      executionLeaseAcquired: true,
    );
  }

  /// Call only after a definitive provider result is durably recorded.
  static void settleDefinitiveResult({
    required bool resultDefinitive,
    required bool reportPersisted,
    String? reservationToken,
  }) {
    if (!resultDefinitive || !reportPersisted) return;
    if (!ownsReservation(reservationToken)) return;
    _reservationOwner = null;
    _gate.release();
  }
}
