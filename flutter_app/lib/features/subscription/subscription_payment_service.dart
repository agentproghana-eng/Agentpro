import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';

enum SubscriptionAccountKind {
  business,
  personal,
}

extension SubscriptionAccountKindX on SubscriptionAccountKind {
  String get apiBase => switch (this) {
        SubscriptionAccountKind.business => '/subscriptions',
        SubscriptionAccountKind.personal => '/personal-subscription',
      };

  String get storageKey => switch (this) {
        SubscriptionAccountKind.business =>
          'pending_paystack_business_subscription_reference',
        SubscriptionAccountKind.personal =>
          'pending_paystack_personal_subscription_reference',
      };
}

class PaystackCheckoutSession {
  final String reference;
  final Uri authorizationUrl;

  const PaystackCheckoutSession({
    required this.reference,
    required this.authorizationUrl,
  });
}

class PaystackVerificationResult {
  final bool activated;
  final String? outcome;
  final String? message;

  const PaystackVerificationResult({
    required this.activated,
    this.outcome,
    this.message,
  });
}

class SubscriptionPaymentService {
  const SubscriptionPaymentService._();

  static Future<PaystackCheckoutSession> initializePaystack(
    SubscriptionAccountKind account,
  ) async {
    final response = await ApiClient.instance.post(
      '${account.apiBase}/paystack/initialize',
    );

    final raw = response.data['data'];

    if (raw is! Map) {
      throw const FormatException(
        'Invalid Paystack initialization response.',
      );
    }

    final data = Map<String, dynamic>.from(raw);

    final reference = data['reference']?.toString().trim() ?? '';

    final authorizationUrl = data['authorization_url']?.toString().trim() ?? '';

    final uri = Uri.tryParse(authorizationUrl);

    if (reference.isEmpty ||
        uri == null ||
        !uri.hasScheme ||
        !const {'https', 'http'}.contains(uri.scheme)) {
      throw const FormatException(
        'The payment checkout could not be initialized.',
      );
    }

    await savePendingReference(
      account,
      reference,
    );

    return PaystackCheckoutSession(
      reference: reference,
      authorizationUrl: uri,
    );
  }

  static Future<bool> launchCheckout(
    Uri authorizationUrl,
  ) async {
    try {
      return await launchUrl(
        authorizationUrl,
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      return false;
    }
  }

  static Future<PaystackVerificationResult> verifyPaystack(
    SubscriptionAccountKind account,
    String reference,
  ) async {
    final encodedReference = Uri.encodeComponent(reference.trim());

    if (encodedReference.isEmpty) {
      throw const FormatException(
        'Missing Paystack payment reference.',
      );
    }

    final response = await ApiClient.instance.get(
      '${account.apiBase}/paystack/verify/$encodedReference',
    );

    final raw = response.data['data'];

    if (raw is! Map) {
      throw const FormatException(
        'Invalid Paystack verification response.',
      );
    }

    final data = Map<String, dynamic>.from(raw);

    return PaystackVerificationResult(
      activated: data['activated'] == true,
      outcome: data['outcome']?.toString(),
      message: response.data['message']?.toString(),
    );
  }

  static Future<void> savePendingReference(
    SubscriptionAccountKind account,
    String reference,
  ) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(
      account.storageKey,
      reference,
    );
  }

  static Future<String?> restorePendingReference(
    SubscriptionAccountKind account,
  ) async {
    final prefs = await SharedPreferences.getInstance();

    final value = prefs.getString(account.storageKey)?.trim();

    if (value == null || value.isEmpty) {
      return null;
    }

    return value;
  }

  static Future<void> clearPendingReference(
    SubscriptionAccountKind account,
  ) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.remove(
      account.storageKey,
    );
  }

  static String errorMessage(
    Object error, {
    required String fallback,
  }) {
    if (error is DioException) {
      final raw = error.response?.data;

      if (raw is Map) {
        final message = raw['message']?.toString().trim();

        if (message != null && message.isNotEmpty) {
          return message;
        }
      }
    }

    return fallback;
  }
}
