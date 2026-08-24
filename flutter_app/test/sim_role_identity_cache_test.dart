import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:agent_pro_ghana/core/services/sim_role_assignment_service.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
    'different ICCID in same slot cannot inherit old role',
    () async {
      await SimRoleAssignmentService.cacheRoleForSlot(
        slot: 0,
        role: 'merchant',
        simIccid: 'SIM-A',
        simSubscriptionId: 10,
        provider: 'mtn',
      );

      expect(
        await SimRoleAssignmentService.cachedRoleForSlot(
          0,
          simIccid: 'SIM-A',
          simSubscriptionId: 10,
          provider: 'mtn',
        ),
        'merchant',
      );

      expect(
        await SimRoleAssignmentService.cachedRoleForSlot(
          0,
          simIccid: 'SIM-B',
          simSubscriptionId: 10,
          provider: 'mtn',
        ),
        isNull,
      );
    },
  );

  test(
    'unresolved identity uses provider subscription and slot',
    () async {
      await SimRoleAssignmentService.cacheRoleForSlot(
        slot: 1,
        role: 'evd',
        simSubscriptionId: 21,
        provider: 'mtn',
      );

      expect(
        await SimRoleAssignmentService.cachedRoleForSlot(
          1,
          simSubscriptionId: 21,
          provider: 'mtn',
        ),
        'evd',
      );

      expect(
        await SimRoleAssignmentService.cachedRoleForSlot(
          1,
          simSubscriptionId: 22,
          provider: 'mtn',
        ),
        isNull,
      );
    },
  );

  test(
    'legacy slot-only cache is never trusted',
    () async {
      SharedPreferences.setMockInitialValues({
        'agentpro_sim_role_assignment_v1_0': 'merchant',
      });

      expect(
        await SimRoleAssignmentService.cachedRoleForSlot(
          0,
          simIccid: 'CURRENT-SIM',
          simSubscriptionId: 7,
          provider: 'mtn',
        ),
        isNull,
      );
    },
  );
}
