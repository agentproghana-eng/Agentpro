import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/'
    'transaction_progress_screen.dart',
  ).readAsStringSync();

  test(
    'progress establishes expected Business role',
    () {
      expect(
        source,
        contains(
          'String? expectedBusinessRole',
        ),
      );

      expect(
        source,
        contains(
          'SimRoleAssignmentService.businessRoleForSlot',
        ),
      );
    },
  );

  test(
    'prepared physical SIM role is checked before execution',
    () {
      expect(
        source,
        contains(
          'actualBusinessRole',
        ),
      );

      expect(
        source,
        contains(
          'actualBusinessRole == expectedBusinessRole',
        ),
      );

      expect(
        source,
        contains(
          'The prepared SIM does not match the selected Business role.',
        ),
      );
    },
  );

  test(
    'Flow Builder cache operations use Business role',
    () {
      final count = RegExp(
        r"businessSimRole: expectedBusinessRole \?\? 'agent'",
      ).allMatches(source).length;

      expect(
        count,
        greaterThanOrEqualTo(4),
      );
    },
  );

  test(
    'Business Flow Builder resolver sends SIM role',
    () {
      expect(
        source,
        contains(
          "'sim_role': expectedBusinessRole ?? 'agent'",
        ),
      );
    },
  );

  test(
    'hardcoded accessibility menus remain Agent only',
    () {
      final count = RegExp(
        r"expectedBusinessRole == 'agent'",
      ).allMatches(source).length;

      expect(
        count,
        greaterThanOrEqualTo(2),
      );
    },
  );
}
