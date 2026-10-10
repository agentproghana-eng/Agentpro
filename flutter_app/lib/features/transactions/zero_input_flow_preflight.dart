import '../../core/api/api_client.dart';
import 'zero_input_flow_eligibility.dart';

/// Short-lived record of server-approved enquiry flows, shared between the
/// Home screen (which verifies ahead of the tap) and the transaction screen.
/// It only skips a repeat flow lookup. Every transaction is still validated
/// by the backend when it is initiated, so this never authorizes execution.
class ZeroInputPreflightApprovals {
  static final Map<String, DateTime> verifiedAt = <String, DateTime>{};
}

/// Resolves the active flow afresh before allowing zero-input auto-start.
/// A failed or incomplete response never authorizes execution.
class ZeroInputFlowPreflight {
  static Future<bool> verify({
    required String provider,
    required String transactionType,
    required bool isPersonal,
    String? businessSimRole,
    String? bundleCategory,
    String? recipientMode,
  }) async {
    final role = businessSimRole?.trim().toLowerCase();

    if (!isPersonal &&
        !const {'agent', 'merchant', 'evd'}.contains(role)) {
      return false;
    }

    if (isPersonal && role != null) {
      return false;
    }

    try {
      final response = await ApiClient.instance.get(
        isPersonal
            ? '/personal-ussd-flows/resolve'
            : '/ussd-flows/resolve',
        queryParameters: <String, dynamic>{
          'provider': provider,
          'transaction_type': transactionType,
          if (!isPersonal) 'mode': 'business',
          if (!isPersonal) 'sim_role': role,
          if (bundleCategory != null)
            'bundle_category': bundleCategory,
          if (recipientMode != null)
            'recipient_mode': recipientMode,
        },
      );

      if (response.statusCode != 200) return false;

      final body = response.data;
      if (body is! Map || body['success'] != true) {
        return false;
      }

      final rawFlow = body['data'];
      if (rawFlow is! Map) return false;

      final flow = Map<String, dynamic>.from(rawFlow);

      if (isPersonal &&
          flow['business_sim_role'] != null) {
        return false;
      }

      return ZeroInputFlowEligibility.isEligible(
        flow,
        provider: provider,
        transactionType: transactionType,
        businessSimRole: isPersonal ? null : role,
        bundleCategory: bundleCategory,
        recipientMode: recipientMode,
      );
    } catch (_) {
      return false;
    }
  }
}
