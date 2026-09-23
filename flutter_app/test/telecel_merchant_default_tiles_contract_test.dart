import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Telecel Merchant has role-specific defaults without Agent fallback',
    () {
      final source = File(
        'lib/features/dashboard/widgets/'
        'dashboard_quick_actions_section.dart',
      ).readAsStringSync();

      expect(
        source,
        contains(
          "role == 'merchant' && provider == 'telecel'",
        ),
      );

      for (final type in <String>[
        'airtime',
        'balance_enquiry',
        'float_to_working',
        'working_to_float',
      ]) {
        expect(source, contains("'$type'"));
      }

      expect(
        source,
        contains(
          'Merchant must never inherit Agent actions',
        ),
      );

      expect(
        source,
        contains(
          'hasRoleSpecificDefaults == false',
        ),
      );
    },
  );
}
