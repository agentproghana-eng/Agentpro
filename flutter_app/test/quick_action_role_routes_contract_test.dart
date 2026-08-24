import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'router exposes four independent Quick Action profiles',
    () {
      final source = File(
        'lib/core/router/app_router.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('/agent-quick-actions'),
      );

      expect(
        source,
        contains('/personal-quick-actions'),
      );

      expect(
        source,
        contains('/evd-quick-actions'),
      );

      expect(
        source,
        contains('/merchant-quick-actions'),
      );

      expect(
        source,
        contains("quickActionRole: 'agent'"),
      );

      expect(
        source,
        contains("quickActionRole: 'subscriber'"),
      );

      expect(
        source,
        contains("quickActionRole: 'evd'"),
      );

      expect(
        source,
        contains("quickActionRole: 'merchant'"),
      );
    },
  );

  test(
    'EVD and Merchant do not inherit Agent catalog',
    () {
      final source = File(
        'lib/features/ussd_settings/'
        'quick_action_customization_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains(
          '_isAgentRole || _isSubscriberRole',
        ),
      );

      expect(
        source,
        contains(
          'Do not expose Agent templates',
        ),
      );

      expect(
        source,
        contains(
          "'evd' => 'evd_quick_actions'",
        ),
      );

      expect(
        source,
        contains(
          "'merchant' => 'merchant_quick_actions'",
        ),
      );
    },
  );
}
