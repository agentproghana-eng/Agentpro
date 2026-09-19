import 'package:shared_preferences/shared_preferences.dart';

import 'storage_service.dart';

class HighAmountWarningService {
  static const String _keyPrefix = 'agentpro_high_amount_warning_v1';

  const HighAmountWarningService._();

  static bool exceeds({
    required double amount,
    required double? limit,
  }) {
    if (!amount.isFinite || amount <= 0) {
      return false;
    }

    if (limit == null || !limit.isFinite || limit <= 0) {
      return false;
    }

    return amount > limit;
  }

  static Future<String?> _currentUserScope() async {
    try {
      final user = await StorageService.getUser();

      if (user == null) {
        return null;
      }

      final id = user['id']?.toString().trim() ?? '';
      if (id.isNotEmpty) {
        return 'id:$id';
      }

      final email = user['email']?.toString().trim().toLowerCase() ?? '';
      if (email.isNotEmpty) {
        return 'email:$email';
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  static String _storageKey(String scope) {
    final safeScope = scope.replaceAll(
      RegExp(r'[^a-zA-Z0-9._-]'),
      '_',
    );

    return '${_keyPrefix}_$safeScope';
  }

  static Future<double?> getLimit() async {
    final scope = await _currentUserScope();
    if (scope == null) {
      return null;
    }

    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.get(_storageKey(scope));

    final value = switch (raw) {
      num number => number.toDouble(),
      String text => double.tryParse(text),
      _ => null,
    };

    if (value == null || !value.isFinite || value <= 0) {
      return null;
    }

    return value;
  }

  static Future<void> setLimit(double amount) async {
    if (!amount.isFinite || amount <= 0) {
      throw ArgumentError.value(
        amount,
        'amount',
        'High-amount warning limit must be greater than zero.',
      );
    }

    final scope = await _currentUserScope();
    if (scope == null) {
      throw StateError(
        'A signed-in AgentPro user is required to save this setting.',
      );
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_storageKey(scope), amount);
  }

  static Future<void> clearLimit() async {
    final scope = await _currentUserScope();
    if (scope == null) {
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey(scope));
  }

  static Future<bool> shouldWarn(double amount) async {
    final limit = await getLimit();

    return exceeds(
      amount: amount,
      limit: limit,
    );
  }
}
