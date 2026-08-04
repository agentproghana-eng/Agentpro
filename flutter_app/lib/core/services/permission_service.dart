import 'package:permission_handler/permission_handler.dart';

/// Manages runtime permission requests required for USSD automation.
///
/// Android 6.0+ requires these to be granted at runtime, not just
/// declared in the manifest:
/// - [Permission.phone] covers both READ_PHONE_STATE (SIM detection)
///   and CALL_PHONE (dialing USSD codes)
class PermissionService {
  // Cache only a confirmed grant for the lifetime of the app process.
  // Denials are never cached, so a user can grant permission and retry.
  // Native SIM/dial calls still enforce the OS permission and provide
  // the final safety check if permission is revoked externally.
  static bool _telephonyGrantedForSession = false;

  /// Check whether all telephony permissions needed for USSD
  /// automation are currently granted.
  static Future<bool> hasTelephonyPermissions() async {
    if (_telephonyGrantedForSession) {
      return true;
    }

    final status = await Permission.phone.status;
    final granted = status.isGranted;

    if (granted) {
      _telephonyGrantedForSession = true;
    }

    return granted;
  }

  /// Request telephony permissions, showing the system dialog if needed.
  /// Returns the resulting [PermissionResult].
  static Future<PermissionResult> requestTelephonyPermissions() async {
    if (_telephonyGrantedForSession) {
      return PermissionResult.granted;
    }

    final status = await Permission.phone.status;

    if (status.isGranted) {
      _telephonyGrantedForSession = true;
      return PermissionResult.granted;
    }

    if (status.isPermanentlyDenied) {
      return PermissionResult.permanentlyDenied;
    }

    final result = await Permission.phone.request();

    if (result.isGranted) {
      _telephonyGrantedForSession = true;
      return PermissionResult.granted;
    }

    if (result.isPermanentlyDenied) {
      return PermissionResult.permanentlyDenied;
    }
    return PermissionResult.denied;
  }

  /// Open the app's system settings page so the user can manually
  /// grant a permanently-denied permission.
  static Future<void> openSettings() async {
    await openAppSettings();
  }
}

enum PermissionResult { granted, denied, permanentlyDenied }
