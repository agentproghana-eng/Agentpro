import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Shift reconciliation UI contracts', () {
    final dashboardFile = File(
      'lib/features/dashboard/widgets/dashboard_shift_card.dart',
    );
    final routerFile = File(
      'lib/core/router/app_router.dart',
    );
    final openShiftFile = File(
      'lib/features/shifts/open_shift_screen.dart',
    );
    final closeShiftFile = File(
      'lib/features/shifts/close_shift_screen.dart',
    );

    test('dashboard opens the declaration screen before creating a shift', () {
      final source = dashboardFile.readAsStringSync();

      expect(
        source,
        contains("context.push('/shifts/open')"),
      );

      expect(
        source,
        isNot(contains("post('/shifts/open')")),
      );
    });

    test('router exposes the Open Shift declaration screen', () {
      final routerSource = routerFile.readAsStringSync();

      expect(
        openShiftFile.existsSync(),
        isTrue,
      );

      expect(
        routerSource,
        contains("path: '/shifts/open'"),
      );

      expect(
        routerSource,
        contains('OpenShiftScreen'),
      );
    });

    test('Open Shift submits canonical cash and exact-SIM declarations', () {
      expect(
        openShiftFile.existsSync(),
        isTrue,
      );

      if (openShiftFile.existsSync() == false) {
        return;
      }

      final source = openShiftFile.readAsStringSync();

      expect(
        source,
        contains('SimCardService.getSimCards()'),
      );

      expect(
        source,
        contains("ApiClient.instance.get('/user-sim-purposes')"),
      );

      expect(
        source,
        contains("'/balances/sim-wallet'"),
      );

      expect(
        source,
        contains('StorageService.getOrCreateInstallationId()'),
      );

      expect(
        source,
        contains("'opening_cash_declared'"),
      );

      expect(
        source,
        contains("'opening_sim_balances'"),
      );

      expect(
        source,
        contains("'sim_iccid'"),
      );

      expect(
        source,
        contains("'installation_id'"),
      );

      expect(
        source,
        contains("'sim_subscription_id'"),
      );

      expect(
        source,
        contains("'sim_slot'"),
      );

      expect(
        source,
        contains("'e_float_declared'"),
      );

      expect(
        source,
        contains("'commission_declared'"),
      );

      expect(
        source,
        contains("post('/shifts/open'"),
      );
    });

    test('Close Shift loads opening snapshots and submits the same wallets',
        () {
      final source = closeShiftFile.readAsStringSync();

      expect(
        source,
        contains("get('/shifts/current')"),
      );

      expect(
        source,
        contains("'opening_sim_balances'"),
      );

      expect(
        source,
        contains("'closing_cash_declared'"),
      );

      expect(
        source,
        contains("'closing_sim_balances'"),
      );

      expect(
        source,
        contains("'sim_wallet_id'"),
      );

      expect(
        source,
        contains("'e_float_declared'"),
      );

      expect(
        source,
        contains("'commission_declared'"),
      );
    });
  });
}
