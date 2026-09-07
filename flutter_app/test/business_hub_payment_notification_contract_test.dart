import 'package:agent_pro_ghana/core/services/notification_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
    'Business Hub payment notification routing',
    () {
      const adId =
          '11111111-1111-4111-8111-111111111111';

      test(
        'payment-required notification opens exact listing',
        () {
          expect(
            notificationRouteForType(
              'ad_payment_required',
              adId: adId,
            ),
            '/marketplace/ads/$adId',
          );
        },
      );

      test(
        'payment-confirmed notification opens exact listing',
        () {
          expect(
            notificationRouteForType(
              'ad_payment_confirmed',
              adId: adId,
            ),
            '/marketplace/ads/$adId',
          );
        },
      );

      test(
        'missing listing identity falls back safely',
        () {
          expect(
            notificationRouteForType(
              'ad_payment_required',
            ),
            '/marketplace',
          );
        },
      );

      test(
        'existing ad notifications retain marketplace fallback',
        () {
          expect(
            notificationRouteForType(
              'ad_approved',
              adId: adId,
            ),
            '/marketplace',
          );
        },
      );
    },
  );
}
