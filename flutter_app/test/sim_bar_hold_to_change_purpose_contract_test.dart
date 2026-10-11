import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final selector =
      File('lib/features/dashboard/widgets/dashboard_provider_selector.dart')
          .readAsStringSync();
  final home =
      File('lib/features/dashboard/home_tab.dart').readAsStringSync();

  test('holding a SIM tab opens a purpose menu; a tap still selects', () {
    expect(selector, contains('onLongPress:'));
    expect(selector, contains('onTap: selected ? null : () => onTap(value)'));
    expect(selector, contains('showMenu<SimRole>('));
    expect(selector, contains('supportedSimRolesForProvider(provider)'));
  });

  test('the menu is only offered when a handler is supplied', () {
    expect(selector, contains('if (onSelected == null) return;'));
    expect(selector, contains('onPurposeSelected == null'));
  });

  test('home saves only the changed SIM, like Settings > SIM Purpose', () {
    final change = home
        .split('Future<void> _changeSimPurpose(')[1]
        .split('Future<void> _refreshSimPurposesFromServer(')[0];
    expect(change, contains("'/user-sim-purposes'"));
    expect(change, contains("'sim_iccid':"));
    expect(change, contains("'sim_subscription_id':"));
    expect(change, contains("'installation_id': installationId"));
    expect(change, contains('SimRoleAssignmentService.cacheRoleForSlot('));
    // The local role is only updated after the server accepted the change.
    expect(
      change.indexOf('SimRoleAssignmentService.cacheRoleForSlot('),
      greaterThan(change.indexOf('ApiClient.instance.put(')),
    );
    expect(change, contains('ZeroInputPreflightApprovals.verifiedAt'));
    expect(change, contains('Could not change the SIM purpose'));
  });

  test('personal-only accounts and repeat saves are excluded', () {
    expect(home, contains('onPurposeSelected: _isPersonalOnlyCustomer'));
    expect(home, contains('_changingSimPurpose'));
    expect(home, contains("authState.user['role'] == 'customer'"));
  });
}
