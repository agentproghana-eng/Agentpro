import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/features/balances/my_balance_role_policy.dart';

void main() {
  group('My Balance SIM role policy', () {
    test('only Agent role uses the Agent ledger UI', () {
      expect(myBalanceUsesAgentLedger('agent'), isTrue);

      expect(myBalanceUsesAgentLedger('merchant'), isFalse);

      expect(myBalanceUsesAgentLedger('evd'), isFalse);

      expect(myBalanceUsesAgentLedger('subscriber'), isFalse);

      expect(myBalanceUsesAgentLedger(null), isFalse);
    });

    test('uses canonical role labels', () {
      expect(myBalanceSimRoleLabel('agent'), 'Agent SIM');

      expect(myBalanceSimRoleLabel('merchant'), 'Merchant SIM');

      expect(myBalanceSimRoleLabel('evd'), 'EVD SIM');

      expect(myBalanceSimRoleLabel('subscriber'), 'Subscriber SIM');

      expect(myBalanceSimRoleLabel(null), 'Unverified SIM');
    });

    test('legacy personal canonicalizes to Subscriber', () {
      expect(canonicalMyBalanceSimRole('personal'), 'subscriber');
    });
  });

  group('My Balance screen role contract', () {
    late String source;

    setUpAll(() {
      source = File(
        'lib/features/balances/my_balance_screen.dart',
      ).readAsStringSync();
    });

    test('uses server-returned SIM role and balance domain', () {
      expect(source.contains("data['sim_role']"), isTrue);

      expect(source.contains("data['balance_domain']"), isTrue);

      expect(source.contains("data['balance_semantics_validated']"), isTrue);
    });

    test('Agent actions are behind the Agent role gate', () {
      expect(source.contains('final isAgent ='), isTrue);

      expect(source.contains('myBalanceUsesAgentLedger'), isTrue);

      expect(source.contains('isAgent &&'), isTrue);

      expect(source.contains("'Declare Float'"), isTrue);

      expect(source.contains("'working_to_float'"), isTrue);

      expect(source.contains("'float_to_working'"), isTrue);
    });

    test('non-Agent role uses generic validated balances', () {
      expect(source.contains('roleBalances'), isTrue);

      expect(source.contains('balanceSemanticsValidated'), isTrue);

      expect(
        source.contains(
          'Agent balances and Agent actions are hidden for this SIM.',
        ),
        isTrue,
      );
    });

    test('unverified balance read fails closed', () {
      expect(
        source.contains('This SIM role or balance could not be verified.'),
        isTrue,
      );

      expect(source.contains("simRole: ''"), isTrue);
    });
  });

  test(
    'Commission Transfer uses canonical transaction route',
    () {
      final source = File(
        'lib/features/balances/my_balance_screen.dart',
      ).readAsStringSync();

      expect(
        source.contains(
          '/balances/commission-transfer',
        ),
        isFalse,
      );

      expect(
        source.contains(
          "'commission_transfer'",
        ),
        isTrue,
      );

      expect(
        source.contains(
          '_transactionRoute',
        ),
        isTrue,
      );
    },
  );
}
