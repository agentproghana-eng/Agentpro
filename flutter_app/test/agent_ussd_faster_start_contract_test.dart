import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();
  final roles = File(
    'lib/core/services/sim_role_assignment_service.dart',
  ).readAsStringSync();
  final storage = File(
    'lib/core/services/storage_service.dart',
  ).readAsStringSync();

  group('faster Agent-side USSD start keeps its safety checks', () {
    test('local lookups start before the amount warning and are awaited later',
        () {
      expect(
        screen,
        contains('final installationIdFuture = StorageService.getOrCreateInstallationId()'),
      );
      expect(screen, contains('final connectivityFuture = Connectivity().checkConnectivity()'));
      expect(screen, contains('installationId = await installationIdFuture;'));
      expect(screen, contains('final connectivity = await connectivityFuture;'));
    });

    test('the kill switch is still a live check, just started earlier', () {
      expect(screen, contains('final transactionDisabledFuture = () async {'));
      expect(screen, contains('FeatureFlagService.isTransactionDisabled('));
      expect(screen, contains('allowNetwork: !offline,'));
      expect(
        screen,
        contains('final transactionDisabled = await transactionDisabledFuture;'),
      );
    });

    test('SIM role skip is short, role-agnostic and only after a confirmation',
        () {
      expect(
        screen,
        contains('skipRefreshIfVerifiedWithin: const Duration(minutes: 2)'),
      );
      expect(roles, contains('static void clearServerVerification()'));
      expect(roles, contains('_serverVerifiedAt.remove(key);'));
      expect(roles, contains('trustedCached != null &&'));
      expect(storage, contains('SimRoleAssignmentService.clearServerVerification();'));
      // Never role specific.
      expect(roles.contains("== 'merchant'"), isFalse);
    });

    test('flow is fetched alongside transaction creation and still fail-closed',
        () {
      expect(progress, contains('Future<dynamic>? flowResolvePrefetch;'));
      expect(progress, contains("widget.data['transaction_future'] != null"));
      expect(progress, contains('await (flowResolvePrefetch ??'));
      // The transaction must still exist and the device be ready before dial.
      expect(progress, contains('transactionFuture,'));
      expect(progress, contains('deviceFuture,'));
      expect(
        progress,
        contains('USSD_FLOW_INVALID_CONFIGURATION'),
      );
    });
  });
}
