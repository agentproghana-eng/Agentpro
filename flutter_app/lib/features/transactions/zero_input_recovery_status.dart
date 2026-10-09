import '../../core/api/api_client.dart';
import 'zero_input_execution_session.dart';

/// Read-only diagnostic snapshot. Never releases the lock or redials USSD.
class ZeroInputRecoveryStatus {
  ZeroInputRecoveryStatus._();

  static Future<String> inspect() async {
    final identity = await ZeroInputExecutionSession.readUnresolvedIdentity();
    if (identity == null) return 'unresolved_or_unavailable';
    final id = identity['transaction_id'];
    final operationId = identity['client_operation_id'];
    final prefix = identity['account_mode'] == 'personal'
        ? '/personal-transactions'
        : '/transactions';
    final path = id != null
        ? '$prefix/$id'
        : '$prefix/recovery/by-operation/$operationId';
    try {
      final response = await ApiClient.instance.get(path);
      final body = response.data;
      if (body is! Map || body['success'] != true) return 'unverified';
      final data = body['data'];
      if (data is! Map ||
          (id != null && data['id']?.toString() != id) ||
          (id == null &&
              (data['id']?.toString().isEmpty ?? true)) ||
          data['transaction_type']?.toString() !=
              identity['transaction_type']) {
        return 'unverified';
      }
      final status = data['status']?.toString();
      if (status == 'success' || status == 'failed' || status == 'cancelled') {
        // A server status alone does not prove provider reporting is complete.
        return 'server_definitive_needs_report_verification';
      }
      return 'pending_confirmation';
    } catch (_) {
      return 'unverified';
    }
  }
}
