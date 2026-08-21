import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/core/services/notification_service.dart';

void main() {
  group('notification delivery idempotency', () {
    test('delivery key maps to a stable positive notification id', () {
      const key = 'transaction:abc:completion:success';

      final first = notificationIdForDeliveryKey(key);
      final second = notificationIdForDeliveryKey(key);

      expect(first, second);
      expect(first, greaterThanOrEqualTo(0));
      expect(first, lessThanOrEqualTo(0x7fffffff));
    });

    test('different delivery keys do not collapse in the fixture', () {
      expect(
        notificationIdForDeliveryKey(
          'transaction:abc:completion:success',
        ),
        isNot(
          notificationIdForDeliveryKey(
            'transaction:abc:completion:failed',
          ),
        ),
      );
    });

    test('pending confirmation routes to transactions', () {
      expect(
        notificationRouteForType(
          'transaction_pending_confirmation',
        ),
        '/transactions',
      );
    });
  });
}
