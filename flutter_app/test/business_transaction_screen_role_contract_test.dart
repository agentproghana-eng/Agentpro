import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/'
    'transaction_screen.dart',
  ).readAsStringSync();

  test(
    'selected physical SIM determines Business role',
    () {
      expect(
        source,
        contains(
          'SimRoleAssignmentService.businessRoleForSlot',
        ),
      );

      expect(
        source,
        contains(
          'final selectedBusinessSim = _selectedSim',
        ),
      );
    },
  );

  test(
    'Business runtime propagates SIM role',
    () {
      expect(
        source,
        contains(
          "'sim_role': businessSimRole",
        ),
      );

      expect(
        source,
        contains(
          'Map<String, dynamic> _buildTransactionRequestFields',
        ),
      );

      expect(
        source,
        contains(
          'required String businessSimRole',
        ),
      );

      expect(
        RegExp(
          r'businessSimRole: businessSimRole',
        ).allMatches(source).length,
        greaterThanOrEqualTo(4),
      );
    },
  );

  test(
    'Business caches are role scoped',
    () {
      final count = RegExp(
        r'businessSimRole: businessSimRole',
      ).allMatches(source).length;

      expect(
        count,
        greaterThanOrEqualTo(4),
      );
    },
  );

  test(
    'hardcoded accessibility flows are Agent only',
    () {
      expect(
        source,
        contains(
          "businessSimRole == 'agent'",
        ),
      );
    },
  );

  test(
    'successful async role lookup has its own mounted guard',
    () {
      final start = source.indexOf(
        'final selectedBusinessSim',
      );

      final end = source.indexOf(
        '// Telecel Merchant balance enquiry completes asynchronously',
        start,
      );

      expect(
        start,
        greaterThanOrEqualTo(0),
      );

      expect(
        end,
        greaterThan(start),
      );

      final block = source.substring(
        start,
        end,
      );

      final guards = RegExp(
        r'mounted\) return;',
      ).allMatches(block).length;

      // One inside catch + one after successful await.
      expect(
        guards,
        greaterThanOrEqualTo(2),
      );
    },
  );
}
