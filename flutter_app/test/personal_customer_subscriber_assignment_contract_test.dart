import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _block(
  String source,
  String startSignature,
  String endSignature,
) {
  final start = source.indexOf(startSignature);

  if (start < 0) {
    throw StateError(
      'Missing start signature: $startSignature',
    );
  }

  final end = source.indexOf(
    endSignature,
    start + startSignature.length,
  );

  if (end < 0) {
    throw StateError(
      'Missing end signature: $endSignature',
    );
  }

  return source.substring(start, end);
}

void main() {
  group('Personal customer Subscriber onboarding', () {
    final home = File(
      'lib/features/dashboard/personal_home_screen.dart',
    ).readAsStringSync();

    final simPurpose = File(
      'lib/features/settings/sim_purpose_settings_screen.dart',
    ).readAsStringSync();

    final simRole = File(
      'lib/shared/models/sim_role.dart',
    ).readAsStringSync();

    test('Personal remains canonically Subscriber', () {
      expect(
        simRole,
        contains("if (normalized == 'personal')"),
      );

      expect(
        simRole,
        contains("return 'subscriber';"),
      );
    });

    test(
      'automatic assignment is restricted to customer accounts',
      () {
        expect(
          home,
          contains(
            "authState.user['role'] == 'customer'",
          ),
        );

        final block = _block(
          home,
          '  Future<Map<int, String>> _ensureCustomerSubscriberRoles(',
          '  // Mirrors the Agent Home tab',
        );

        expect(
          block,
          contains(
            'if (!_isPersonalOnlyCustomer || sims.isEmpty)',
          ),
        );
      },
    );

    test(
      'Personal customer SIM is provisioned as Subscriber',
      () {
        final block = _block(
          home,
          '  Future<Map<int, String>> _ensureCustomerSubscriberRoles(',
          '  // Mirrors the Agent Home tab',
        );

        expect(
          block,
          contains("'purpose': 'subscriber'"),
        );

        expect(
          block,
          contains("'/user-sim-purposes'"),
        );

        expect(
          block,
          contains("role: 'subscriber'"),
        );
      },
    );

    test(
      'server acceptance precedes local Subscriber trust',
      () {
        final block = _block(
          home,
          '  Future<Map<int, String>> _ensureCustomerSubscriberRoles(',
          '  // Mirrors the Agent Home tab',
        );

        final serverWrite = block.indexOf(
          'await ApiClient.instance.put(',
        );

        final cacheWrite = block.indexOf(
          'await SimRoleAssignmentService.cacheRoleForSlot(',
        );

        expect(serverWrite, greaterThanOrEqualTo(0));
        expect(cacheWrite, greaterThan(serverWrite));
      },
    );

    test(
      'failed provisioning keeps previous trusted roles',
      () {
        final block = _block(
          home,
          '  Future<Map<int, String>> _ensureCustomerSubscriberRoles(',
          '  // Mirrors the Agent Home tab',
        );

        expect(
          block,
          contains('return currentRoles;'),
        );
      },
    );

    test(
      'Personal customer SIM Purpose stays Subscriber',
      () {
        expect(
          simPurpose,
          contains(
            "authState.user['role'] == 'customer'",
          ),
        );

        expect(
          simPurpose,
          contains(
            'roles[card.slot] = SimRole.subscriber;',
          ),
        );

        expect(
          simPurpose,
          contains(
            '? const <SimRole>[SimRole.subscriber]',
          ),
        );

        expect(
          simPurpose,
          contains(
            '? SimRole.subscriber',
          ),
        );
      },
    );
  });
}
