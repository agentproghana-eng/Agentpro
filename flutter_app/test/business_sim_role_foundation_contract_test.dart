import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Agent EVD and Merchant are Business roles',
    () {
      final source = File(
        'lib/shared/models/sim_role.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('SimRole.agent => true'),
      );

      expect(
        source,
        contains('SimRole.evd => true'),
      );

      expect(
        source,
        contains('SimRole.merchant => true'),
      );

      expect(
        source,
        contains('SimRole.subscriber => false'),
      );
    },
  );

  test(
    'SIM service supports multiple SIMs for one provider',
    () {
      final source = File(
        'lib/core/services/sim_card_service.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('getSimsForProvider'),
      );

      expect(
        source,
        contains('getProviderSimGroups'),
      );
    },
  );

  test(
    'Settings exposes the four Quick Action profiles',
    () {
      final source = File(
        'lib/features/settings/settings_screen.dart',
      ).readAsStringSync();

      expect(source, contains('Agent Quick Actions'));
      expect(source, contains('EVD Quick Actions'));
      expect(source, contains('Merchant Quick Actions'));
      expect(source, contains('Subscriber Quick Actions'));
    },
  );
}
