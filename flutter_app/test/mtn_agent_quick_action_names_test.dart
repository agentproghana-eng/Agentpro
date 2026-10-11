import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_catalog.dart';

void main() {
  test('MTN Agent Quick Actions use the names agents say', () {
    expect(mtnAgentQuickActionLabel('send_money'), 'Cash In/Out');
    expect(mtnAgentQuickActionLabel('commission_balance'),
        'Cash Out Commission');
    expect(mtnAgentQuickActionLabel('commission_transfer'),
        'Transfer Commission');
    expect(mtnAgentQuickActionLabel('cash_in_commission'), isNull);
  });

  test('renaming keeps the rest of the definition', () {
    const original = QuickActionCatalogDefinition(
      provider: 'mtn',
      type: 'commission_balance',
      displayLabel: 'Commission Balance',
      quickActionGroup: 'Balances & Commission',
      hasServerDrivenFormSchema: true,
    );

    final renamed = original.withDisplayLabel('Cash Out Commission');

    expect(renamed.displayLabel, 'Cash Out Commission');
    expect(renamed.type, 'commission_balance');
    expect(renamed.quickActionGroup, 'Balances & Commission');
    expect(renamed.hasServerDrivenFormSchema, isTrue);
  });
}
