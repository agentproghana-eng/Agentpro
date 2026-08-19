import 'dart:io';

import 'package:flutter/services.dart';
import 'package:local_auth/error_codes.dart' as auth_error;
import 'package:local_auth/local_auth.dart';

import 'storage_service.dart';

/// Local phone-authentication service used to protect a cached AgentPro
/// session.
///
/// The class keeps its historical [BiometricService] name so existing app
/// integrations remain source-compatible, but authentication is deliberately
/// broader than biometrics.
///
/// AgentPro may be unlocked with any secure authentication method supported
/// by the phone, including fingerprint, face, PIN, pattern, or device
/// password.
///
/// CRITICAL SECURITY RULE:
/// Phone authentication unlocks AgentPro only.
/// It never replaces, captures, stores, pre-fills, or submits a mobile-money
/// PIN. Mobile-money PIN entry remains exclusively on the provider USSD UI.
class DeviceAuthApproval {
  DeviceAuthApproval._();
}

/// Local phone-authentication boundary used only to unlock AgentPro.
///
/// It never replaces, captures, stores, pre-fills, or submits a mobile-money
/// PIN. Mobile-money PIN entry remains exclusively on the provider USSD UI.
class BiometricService {
  static final _auth = LocalAuthentication();

  static const MethodChannel _deviceSecurityChannel = MethodChannel(
    'com.agentpro.ghana/device_security',
  );

  static DeviceAuthApproval? _pendingUnlockApproval;

  /// Checks whether secure local phone authentication is actually usable.
  ///
  /// `isDeviceSupported()` only establishes platform capability. Android also
  /// requires KeyguardManager.isDeviceSecure so Swipe/None cannot qualify as
  /// AgentPro authentication.
  static Future<BiometricAvailability> checkDeviceAuthAvailability() async {
    try {
      final supported = await _auth.isDeviceSupported();

      if (!supported) {
        return BiometricAvailability.notAvailable;
      }

      if (Platform.isAndroid) {
        try {
          final secure = await _deviceSecurityChannel.invokeMethod<bool>(
                'isDeviceSecure',
              ) ??
              false;

          if (!secure) {
            return BiometricAvailability.notEnrolled;
          }
        } on MissingPluginException {
          return BiometricAvailability.notAvailable;
        } on PlatformException {
          return BiometricAvailability.notAvailable;
        }
      }

      return BiometricAvailability.available;
    } on PlatformException {
      return BiometricAvailability.notAvailable;
    }
  }

  static Future<BiometricAvailability> checkAvailability() =>
      checkDeviceAuthAvailability();

  static Future<List<BiometricType>> getAvailableTypes() async {
    try {
      return await _auth.getAvailableBiometrics();
    } on PlatformException {
      return [];
    }
  }

  /// Performs the local phone-authentication challenge.
  ///
  /// Success creates one in-memory approval object. AuthBloc must consume that
  /// exact object before it is allowed to clear the persisted session lock.
  static Future<BiometricResult> authenticateToUnlock() async {
    _pendingUnlockApproval = null;

    final availability = await checkDeviceAuthAvailability();

    if (availability == BiometricAvailability.notEnrolled) {
      return BiometricResult.notEnrolled;
    }

    if (availability != BiometricAvailability.available) {
      return BiometricResult.notAvailable;
    }

    try {
      final authenticated = await _auth.authenticate(
        localizedReason: 'Unlock AgentPro',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          sensitiveTransaction: false,
        ),
      );

      if (!authenticated) {
        return BiometricResult.cancelled;
      }

      _pendingUnlockApproval = DeviceAuthApproval._();

      return BiometricResult.success;
    } on PlatformException catch (e) {
      _pendingUnlockApproval = null;

      switch (e.code) {
        case auth_error.notAvailable:
          return BiometricResult.notAvailable;
        case auth_error.notEnrolled:
          return BiometricResult.notEnrolled;
        case auth_error.lockedOut:
          return BiometricResult.lockedOut;
        case auth_error.permanentlyLockedOut:
          return BiometricResult.permanentlyLockedOut;
        default:
          return BiometricResult.error;
      }
    }
  }

  static DeviceAuthApproval? get pendingUnlockApproval =>
      _pendingUnlockApproval;

  static bool consumeUnlockApproval(
    DeviceAuthApproval approval,
  ) {
    if (!identical(
      approval,
      _pendingUnlockApproval,
    )) {
      return false;
    }

    _pendingUnlockApproval = null;
    return true;
  }

  static void clearPendingUnlockApproval() {
    _pendingUnlockApproval = null;
  }

  static Future<BiometricResult> enableDeviceAuthWithResult() async {
    final result = await authenticateToUnlock();

    clearPendingUnlockApproval();

    if (result == BiometricResult.success) {
      await StorageService.setBiometricEnabled(true);
    }

    return result;
  }

  static Future<bool> enableDeviceAuth() async {
    return await enableDeviceAuthWithResult() == BiometricResult.success;
  }

  static Future<void> disableDeviceAuth() async {
    clearPendingUnlockApproval();
    await StorageService.setBiometricEnabled(false);
  }

  static Future<bool> isDeviceAuthEnabled() async {
    final availability = await checkDeviceAuthAvailability();

    if (availability != BiometricAvailability.available) {
      return false;
    }

    final preference = await StorageService.getDeviceAuthPreference();

    return preference != false;
  }

  static Future<String> getDeviceAuthLabel() async {
    final types = await getAvailableTypes();

    String? biometricLabel;

    if (types.contains(BiometricType.face)) {
      biometricLabel = 'face authentication';
    } else if (types.contains(BiometricType.fingerprint)) {
      biometricLabel = 'fingerprint';
    } else if (types.contains(BiometricType.iris)) {
      biometricLabel = 'iris authentication';
    }

    if (biometricLabel == null) {
      return 'your phone PIN, pattern, or password';
    }

    return '$biometricLabel or your phone PIN, pattern, or password';
  }

  static Future<bool> enableBiometric() => enableDeviceAuth();

  static Future<void> disableBiometric() => disableDeviceAuth();

  static Future<bool> isBiometricEnabled() => isDeviceAuthEnabled();

  static Future<String> getBiometricLabel() => getDeviceAuthLabel();
}

/// Historical enum name retained for source compatibility.
///
/// `available` now means secure device-level authentication is supported; it
/// does not require an enrolled biometric.
enum BiometricAvailability {
  available,
  notAvailable,
  notEnrolled,
}

enum BiometricResult {
  success,
  cancelled,
  notAvailable,
  notEnrolled,
  lockedOut,
  permanentlyLockedOut,
  error,
}
