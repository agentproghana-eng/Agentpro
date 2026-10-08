import 'dart:convert';

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

  /// Persist before backend initiation; existing or unreadable state blocks.
  static Future<bool> persistBeforeInitiation(String? token) async {
    if (!ownsReservation(token)) return false;
    try {
      if (await _storage.read(key: _unresolvedKey) != null) return false;
      await _storage.write(key: _unresolvedKey, value: token!);
      return ownsReservation(token);
    } catch (_) {
      return false;
    }
  }

  /// Persist a non-sensitive server lookup identity before allowing USSD.
  /// The existing unresolved token remains the authoritative lock.
  static Future<bool> recordBackendIdentity({
    required String? token,
    required String transactionId,
    required String transactionType,
    required bool isPersonal,
  }) async {
    if (!ownsReservation(token) || transactionId.isEmpty ||
        transactionId.startsWith('local_')) return false;
    try {
      if (await _storage.read(key: _unresolvedKey) != token) return false;
      await _storage.write(
        key: _identityKey,
        value: jsonEncode(<String, dynamic>{
          'reservation_token': token,
          'transaction_id': transactionId,
          'transaction_type': transactionType,
          'account_mode': isPersonal ? 'personal' : 'business',
        }),
      );
      return await _storage.read(key: _identityKey) != null &&
          await _storage.read(key: _unresolvedKey) == token;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> clearDurableReservation(String? token) async {
    if (!ownsReservation(token)) return false;
    try {
      if (await _storage.read(key: _unresolvedKey) != token) return false;
      // If identity cleanup fails, keep the authoritative lock intact.
      await _storage.delete(key: _identityKey);
      await _storage.delete(key: _unresolvedKey);
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> abandonDurableBeforeBackendInitiation(String? token) async {
    if (!ownsReservation(token)) return;
    try {
      final existing = await _storage.read(key: _unresolvedKey);
      if (existing != null && existing != token) return;
      if (existing == token) {
        await _storage.delete(key: _identityKey);
        await _storage.delete(key: _unresolvedKey);
      }
      abandonBeforeBackendInitiation(token);
    } catch (_) {
      // Storage uncertain: retain the process lease.
    }
  }

  static int _nextReservation = 0;
  static String? _reservationOwner;

  /// Reserve synchronously before initiating a backend transaction.
  /// A reservation does not grant permission to dial.
  static String? reserveForInitiation() {
    if (!_gate.tryAcquire()) return null;
    final token = 'zero_input_${++_nextReservation}';
    _reservationOwner = token;
    return token;
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
    if (reservationToken != null) {
      if (!ownsReservation(reservationToken)) return false;
    } else if (!_gate.tryAcquire()) {
      return false;
    }
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
    if (_reservationOwner != null && !ownsReservation(reservationToken)) return;
    _reservationOwner = null;
    _gate.release();
  }
}
