import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final personalHome = File(
    'lib/features/dashboard/'
    'personal_home_screen.dart',
  ).readAsStringSync();

  final personalTransaction = File(
    'lib/features/transactions/'
    'personal_transaction_screen.dart',
  ).readAsStringSync();

  final openShift = File(
    'lib/features/shifts/'
    'open_shift_screen.dart',
  ).readAsStringSync();

  final simRoleService = File(
    'lib/core/services/'
    'sim_role_assignment_service.dart',
  ).readAsStringSync();

  test(
    'Personal Home accepts only verified Subscriber SIMs',
    () {
      expect(
        personalHome,
        contains(
          'SimRoleAssignmentService.rolesForSims',
        ),
      );

      expect(
        personalHome,
        contains(
          "purposes[sim.slot] == 'subscriber'",
        ),
      );

      expect(
        simRoleService,
        contains('simIccid: sim.iccid'),
      );

      expect(
        simRoleService,
        contains(
          'simSubscriptionId: sim.subscriptionId',
        ),
      );
    },
  );

  test(
    'Personal Transaction accepts only verified Subscriber SIMs',
    () {
      expect(
        personalTransaction,
        contains(
          'SimRoleAssignmentService.rolesForSims',
        ),
      );

      expect(
        personalTransaction,
        contains(
          "purposes[sim.slot] == 'subscriber'",
        ),
      );

      expect(
        simRoleService,
        contains(
          'provider: sim.network',
        ),
      );
    },
  );

  test(
    'EVD and Merchant cannot enter Subscriber path via non-Agent filtering',
    () {
      expect(
        personalHome,
        isNot(
          contains(
            "purposes[sim.slot] != 'agent'",
          ),
        ),
      );

      expect(
        personalTransaction,
        isNot(
          contains(
            "purposes[sim.slot] != 'agent'",
          ),
        ),
      );
    },
  );

  test(
    'Open Shift does not default unknown role to Agent',
    () {
      expect(
        openShift,
        contains(
          'SimRoleAssignmentService.roleForSlot',
        ),
      );

      expect(
        openShift,
        contains(
          "purpose == 'agent'",
        ),
      );

      expect(
        openShift,
        isNot(
          contains(
            "purposes[card.slot] ?? 'agent'",
          ),
        ),
      );
    },
  );
}
