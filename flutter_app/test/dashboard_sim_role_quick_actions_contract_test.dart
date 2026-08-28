import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final homeSource = File(
    'lib/features/dashboard/home_tab.dart',
  ).readAsStringSync();

  final quickActionSource = File(
    'lib/features/dashboard/widgets/'
    'dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  test(
    'dashboard resolves installed SIM roles by physical identity',
    () {
      expect(
        homeSource,
        contains(
          'SimRoleAssignmentService.rolesForSims',
        ),
      );

      expect(
        homeSource,
        contains(
          'refreshFromServer: true',
        ),
      );

      final roleService = File(
        'lib/core/services/'
        'sim_role_assignment_service.dart',
      ).readAsStringSync();

      expect(
        roleService,
        contains(
          'simIccid: sim.iccid',
        ),
      );

      expect(
        roleService,
        contains(
          'simSubscriptionId: sim.subscriptionId',
        ),
      );

      expect(
        roleService,
        contains(
          'provider: sim.network',
        ),
      );
    },
  );

  test(
    'dashboard loads every canonical Quick Action role profile',
    () {
      expect(
        homeSource,
        contains(
          "data['subscriber']",
        ),
      );

      expect(
        homeSource,
        contains(
          "data['evd']",
        ),
      );

      expect(
        homeSource,
        contains(
          "data['merchant']",
        ),
      );
    },
  );

  test(
    'dashboard supports more than one SIM for one provider',
    () {
      expect(
        homeSource,
        contains(
          '_providerSims',
        ),
      );

      expect(
        quickActionSource,
        contains(
          'selectedSimSlot',
        ),
      );

      expect(
        quickActionSource,
        contains(
          '_buildSimSelector',
        ),
      );
    },
  );

  test(
    'dashboard recognizes Agent Subscriber EVD and Merchant',
    () {
      for (final role in [
        'agent',
        'subscriber',
        'evd',
        'merchant',
      ]) {
        expect(
          quickActionSource,
          contains("'$role'"),
        );
      }

      expect(
        quickActionSource.contains(
          'Personal or Agent',
        ),
        isFalse,
      );
    },
  );

  test(
    'EVD and Merchant do not inherit Agent catalog fallback',
    () {
      expect(
        quickActionSource,
        contains(
          'EVD and Merchant deliberately have no Agent fallback',
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'evd' => evdQuickActions",
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'merchant' => merchantQuickActions",
        ),
      );
    },
  );

  test(
    'Subscriber and Business roles route through different transaction screens',
    () {
      expect(
        quickActionSource,
        contains(
          "role == 'subscriber'",
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'/personal-transactions/new'",
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'/transactions'",
        ),
      );
    },
  );

  test(
    'dashboard routes carry selected physical SIM identity',
    () {
      expect(
        quickActionSource,
        contains(
          "'sim_slot'",
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'sim_iccid'",
        ),
      );

      expect(
        quickActionSource,
        contains(
          "'sim_subscription_id'",
        ),
      );
    },
  );
}
