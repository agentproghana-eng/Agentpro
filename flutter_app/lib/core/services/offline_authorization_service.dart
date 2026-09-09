import '../api/api_client.dart';
import 'storage_service.dart';

class OfflineAuthorizationService {
  OfflineAuthorizationService._();

  static Future<bool> refresh({
    required bool isPersonal,
  }) async {
    final mode = isPersonal ? 'personal' : 'business';

    try {
      final response = await ApiClient.instance.get(
        '/users/me/offline-authorization/$mode',
      );

      final data = response.data['data'];

      if (data is! Map) {
        return false;
      }

      final receipt = data['receipt']?.toString().trim() ?? '';

      final authorizedUntil = DateTime.tryParse(
        data['authorized_until']?.toString() ?? '',
      )?.toUtc();

      if (receipt.isEmpty || authorizedUntil == null) {
        return false;
      }

      return await StorageService.attachOfflineAuthorizationReceipt(
        isPersonal: isPersonal,
        receipt: receipt,
        authorizedUntil: authorizedUntil,
      );
    } catch (_) {
      return false;
    }
  }

  static Future<String?> receiptForExecution({
    required bool isPersonal,
  }) {
    return StorageService.getOfflineAuthorizationReceipt(
      isPersonal: isPersonal,
    );
  }
}
