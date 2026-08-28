import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final simService = File(
    'lib/core/services/sim_card_service.dart',
  ).readAsStringSync();

  final preparationService = File(
    'lib/core/services/'
    'transaction_device_preparation_service.dart',
  ).readAsStringSync();

  final roleService = File(
    'lib/core/services/'
    'sim_role_assignment_service.dart',
  ).readAsStringSync();

  final homeSource = File(
    'lib/features/dashboard/home_tab.dart',
  ).readAsStringSync();

  final personalHomeSource = File(
    'lib/features/dashboard/personal_home_screen.dart',
  ).readAsStringSync();

  final personalTransactionSource = File(
    'lib/features/transactions/'
    'personal_transaction_screen.dart',
  ).readAsStringSync();

  test('SIM discovery deduplicates concurrent native lookups', () {
    expect(
      simService,
      contains('static Future<List<SimCard>>? _inFlightLookup'),
    );

    expect(
      simService,
      contains('final inFlight = _inFlightLookup'),
    );

    expect(
      simService,
      contains('_snapshotTtl = Duration(seconds: 2)'),
    );
  });

  test('empty SIM observations are not retained in warm cache', () {
    expect(
      simService,
      contains('if (sims.isNotEmpty)'),
    );

    expect(
      simService,
      contains('invalidateSnapshot()'),
    );
  });

  test('final transaction SIM verification forces Android refresh', () {
    expect(
      preparationService,
      contains('forceRefresh: true'),
    );

    expect(
      simService,
      contains('if (forceRefresh)'),
    );

    expect(
      simService,
      contains(
        'must not join an ordinary Home/navigation lookup',
      ),
    );
  });

  test('SIM-role batching is request scoped, not globally cached', () {
    expect(
      roleService,
      contains('rolesForSims'),
    );

    expect(
      roleService,
      contains('_fetchServerPurposes'),
    );

    expect(
      roleService,
      isNot(
        contains('_serverPurposeSnapshot'),
      ),
    );

    expect(
      roleService,
      isNot(
        contains('_serverPurposeSnapshotTtl'),
      ),
    );
  });

  test('Home uses batch physical-SIM role resolution', () {
    expect(
      homeSource,
      contains('SimRoleAssignmentService.rolesForSims'),
    );
  });

  test('Personal Home uses batch physical-SIM role resolution', () {
    expect(
      personalHomeSource,
      contains('SimRoleAssignmentService.rolesForSims'),
    );
  });

  test('Personal transaction form uses batch role resolution', () {
    expect(
      personalTransactionSource,
      contains('SimRoleAssignmentService.rolesForSims'),
    );
  });

  test('identity-bound role verification remains intact', () {
    expect(
      roleService,
      contains('requestedIccid == storedIccid'),
    );

    expect(
      roleService,
      contains('return trustedCached'),
    );

    expect(
      roleService,
      contains('simSubscriptionId'),
    );
  });
}
