import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test(
    'owner glance uses corrected daily accounting metrics',
    () {
      final glance = source(
        'lib/features/dashboard/widgets/dashboard_owner_glance.dart',
      );

      expect(
        glance,
        contains("'Customer Volume'"),
      );

      expect(
        glance,
        contains("'Gross Earnings'"),
      );

      expect(
        glance,
        contains("'Transactions'"),
      );

      expect(
        glance,
        contains("'Provider Commission'"),
      );

      expect(
        glance,
        contains("'Agent Service Fees'"),
      );

      expect(
        glance,
        contains("'Success Rate'"),
      );

      expect(
        glance,
        contains("'today_provider_commission'"),
      );

      expect(
        glance,
        contains("'today_agent_service_fees'"),
      );

      expect(
        glance,
        contains("'today_gross_earnings'"),
      );

      expect(
        glance,
        contains("'today_success_rate'"),
      );
    },
  );
}
