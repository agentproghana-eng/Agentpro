import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/core/services/notification_service.dart';
import 'package:agent_pro_ghana/shared/utils/transaction_labels.dart';

void main() {
  group('notification delivery and routing', () {
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

    test('transaction notification targets exact transaction detail', () {
      expect(
        notificationRouteForType(
          'transaction_pending_confirmation',
          transactionId: 'abc-123',
        ),
        '/transactions/abc-123',
      );

      expect(
        notificationRouteForType(
          'transaction_success',
          transactionId: 'tx-456',
        ),
        '/transactions/tx-456',
      );
    });

    test('transaction notification without identity falls back to history', () {
      expect(
        notificationRouteForType(
          'transaction_failed',
        ),
        '/transactions/history',
      );

      expect(
        notificationRouteForType(
          'transaction_pending_confirmation',
          transactionId: '   ',
        ),
        '/transactions/history',
      );
    });

    test('legacy MTN cash_in resolves to canonical Cash In flow', () {
      expect(
        canonicalBusinessTransactionType(
          'cash_in',
          'mtn',
        ),
        'send_money',
      );
    });

    test('bare transaction route has no implicit Cash In action', () {
      expect(
        canonicalBusinessTransactionType(
          null,
          'mtn',
        ),
        isNull,
      );

      expect(
        canonicalBusinessTransactionType(
          '   ',
          'mtn',
        ),
        isNull,
      );
    });

    test('non-MTN cash_in remains the provider Cash In flow', () {
      expect(
        canonicalBusinessTransactionType(
          'cash_in',
          'telecel',
        ),
        'cash_in',
      );

      expect(
        canonicalBusinessTransactionType(
          'cash_in',
          'at_money',
        ),
        'cash_in',
      );
    });
  });
}
