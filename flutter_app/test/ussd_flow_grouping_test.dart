import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/ussd_flows/'
    'ussd_flow_grouping.dart';

void main() {
  group('groupUssdFlows', () {
    test('collapses Personal seed variants under one mother flow', () {
      final groups = groupUssdFlows(
        [
          {
            'id': 'one',
            'provider': 'mtn',
            'transaction_type': 'buy_mashup',
            'recipient_mode': 'self',
            'bundle_category': 'ghc5_page1_momo',
          },
          {
            'id': 'two',
            'provider': 'mtn',
            'transaction_type': 'buy_mashup',
            'recipient_mode': 'other',
            'bundle_category': 'ghc5_page1_momo',
          },
          {
            'id': 'three',
            'provider': 'mtn',
            'transaction_type': 'buy_mashup',
            'recipient_mode': 'self',
            'bundle_category': 'ghc10_page2_airtime',
          },
        ],
        isPersonal: true,
      );

      expect(groups, hasLength(1));
      expect(groups.single.transactionType, 'buy_mashup');
      expect(groups.single.flows, hasLength(3));
    });

    test('keeps Business SIM roles as separate mother flows', () {
      final groups = groupUssdFlows(
        [
          {
            'id': 'agent-airtime',
            'provider': 'mtn',
            'transaction_type': 'airtime',
            'business_sim_role': 'agent',
          },
          {
            'id': 'merchant-airtime',
            'provider': 'mtn',
            'transaction_type': 'airtime',
            'business_sim_role': 'merchant',
          },
        ],
        isPersonal: false,
      );

      expect(groups, hasLength(2));
      expect(
        groups.map((group) => group.simRole).toSet(),
        {'agent', 'merchant'},
      );
    });

    test('variant label hides database-row terminology', () {
      expect(
        ussdFlowVariantLabel({
          'recipient_mode': 'self',
          'bundle_category': 'flexi_momo',
        }),
        'Self · Flexi Momo',
      );

      expect(
        ussdFlowVariantLabel({}),
        'Default flow',
      );
    });
  });
}
