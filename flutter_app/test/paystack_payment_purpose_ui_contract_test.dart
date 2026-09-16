import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'subscription checkout confirms AgentPro payment purpose before Paystack',
    () {
      final business = File(
        'lib/features/subscription/subscription_screen.dart',
      ).readAsStringSync();

      final personal = File(
        'lib/features/subscription/personal_subscription_screen.dart',
      ).readAsStringSync();

      expect(
        business,
        contains('AgentPro Business Subscription'),
      );
      expect(
        personal,
        contains('AgentPro Personal Subscription'),
      );

      expect(
        business,
        contains('Continue to Paystack'),
      );
      expect(
        personal,
        contains('Continue to Paystack'),
      );

      expect(
        business,
        contains(
          'Processed securely by Paystack for COREINTEL SYSTEMS.',
        ),
      );

      final businessConfirmation = business.indexOf(
        'final confirmed = await _confirmPaystackPayment();',
      );
      final businessInitialization = business.indexOf(
        'SubscriptionPaymentService.initializePaystack',
      );

      expect(businessConfirmation, greaterThanOrEqualTo(0));
      expect(
        businessInitialization,
        greaterThan(businessConfirmation),
      );

      final personalConfirmation = personal.indexOf(
        'final confirmed = await _confirmPaystackPayment();',
      );
      final personalInitialization = personal.indexOf(
        'SubscriptionPaymentService.initializePaystack',
      );

      expect(personalConfirmation, greaterThanOrEqualTo(0));
      expect(
        personalInitialization,
        greaterThan(personalConfirmation),
      );
    },
  );

  test(
    'Marketplace checkout confirms AgentPro listing fee before Paystack',
    () {
      final marketplace = File(
        'lib/features/marketplace/ad_detail_screen.dart',
      ).readAsStringSync();

      expect(
        marketplace,
        contains('AgentPro Marketplace Listing Fee'),
      );

      expect(
        marketplace,
        contains('Continue to Paystack'),
      );

      expect(
        marketplace,
        contains(
          'Processed securely by Paystack for COREINTEL SYSTEMS.',
        ),
      );

      final confirmation = marketplace.lastIndexOf(
        'final confirmed = await _confirmPaystackPayment();',
      );

      final initialization = marketplace.indexOf(
        '/payment/paystack/initialize',
      );

      expect(confirmation, greaterThanOrEqualTo(0));
      expect(initialization, greaterThan(confirmation));
    },
  );
}
