import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _methodBlock(
  String source,
  String signature,
  String nextSignature,
) {
  final start = source.indexOf(signature);

  if (start < 0) {
    throw StateError('Missing signature: $signature');
  }

  final end = source.indexOf(
    nextSignature,
    start + signature.length,
  );

  if (end < 0) {
    throw StateError('Missing end signature: $nextSignature');
  }

  return source.substring(start, end);
}

void main() {
  group('Personal Quick Actions without assigned SIM', () {
    final source = File(
      'lib/features/dashboard/personal_home_screen.dart',
    ).readAsStringSync();

    test('Quick Actions remain visible when no Personal SIM is assigned', () {
      expect(
        source,
        contains('child: _homeQuickActions.isEmpty'),
      );

      expect(
        source,
        isNot(
          contains(
            'child: noSimsDetected\n'
            '                        ? const DashboardEmptyState(',
          ),
        ),
      );

      // The separate SIM warning remains visible above the actions.
      expect(
        source,
        contains(
          "'No Personal SIM is assigned. '",
        ),
      );
    });

    test('Quick Action execution still requires an assigned Personal SIM', () {
      final block = _methodBlock(
        source,
        '  void _startTransaction(String type) {',
        '  Widget _buildFrozenSimIndicators(',
      );

      expect(
        block,
        contains('if (sim == null)'),
      );

      expect(
        block,
        isNot(
          contains(
            '_simMap != null && sim == null',
          ),
        ),
      );

      expect(
        block,
        contains(
          "'Assign a Personal SIM to use this action.'",
        ),
      );

      expect(
        block,
        contains("label: 'Assign SIM'"),
      );

      expect(
        block,
        contains(
          "context.push('/settings/sim-purpose')",
        ),
      );

      final simGate = block.indexOf('if (sim == null)');
      final transactionQuery = block.indexOf(
        'final query = <String, String>{',
      );
      final transactionNavigation = block.indexOf(
        'context.push(uri.toString())',
      );

      expect(simGate, greaterThanOrEqualTo(0));
      expect(transactionQuery, greaterThan(simGate));
      expect(transactionNavigation, greaterThan(transactionQuery));
    });

    test('SIM identity is still supplied to transaction navigation', () {
      final block = _methodBlock(
        source,
        '  void _startTransaction(String type) {',
        '  Widget _buildFrozenSimIndicators(',
      );

      expect(
        block,
        contains("'sim_slot': sim.slot.toString()"),
      );

      expect(
        block,
        contains("'sim_iccid': sim.iccid"),
      );

      expect(
        block,
        contains(
          "'sim_subscription_id': sim.subscriptionId.toString()",
        ),
      );
    });
  });
}
