import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_flow_eligibility.dart';

void main() {
  Map<String, dynamic> flow({
    String role = 'agent',
    String mode = 'interactive',
    List<Map<String, dynamic>>? steps,
  }) =>
      {
        'id': 123,
        'provider': 'mtn',
        'transaction_type': 'check_momo_balance',
        'business_sim_role': role,
        'bundle_category': null,
        'recipient_mode': null,
        'is_active': true,
        'execution_mode': mode,
        'dial_code': '*171#',
        'steps': steps ??
            [
              {
                'action': 'send_digit',
                'action_value': '6',
              },
              {
                'action': 'pin_prompt',
                'action_value': null,
              },
            ],
      };

  bool eligible(Map<String, dynamic> value) =>
      ZeroInputFlowEligibility.isEligible(
        value,
        provider: 'mtn',
        transactionType: 'check_momo_balance',
        businessSimRole: 'agent',
      );

  test('accepts resolved zero-input interactive flow', () {
    expect(eligible(flow()), isTrue);
  });

  test('rejects customer-entered transaction input', () {
    for (final action in [
      'send_customer_phone',
      'send_account_number',
      'send_amount',
      'send_reference',
      'send_merchant_id',
      'send_selection',
      'await_user_selection',
    ]) {
      expect(
        eligible(flow(steps: [
          {'action': action, 'action_value': null}
        ])),
        isFalse,
        reason: action,
      );
    }
  });

  test('rejects protected credential actions until verified', () {
    for (final action in [
      'send_operator_id',
      'send_organisation_shortcode',
    ]) {
      expect(
        eligible(flow(steps: [
          {'action': action, 'action_value': null}
        ])),
        isFalse,
      );
    }
  });

  test('rejects unresolved or unexpected balance variants', () {
    final value = flow();

    expect(
      ZeroInputFlowEligibility.isEligible(
        value,
        provider: 'mtn',
        transactionType: 'check_momo_balance',
        businessSimRole: 'agent',
        recipientMode: 'self',
      ),
      isFalse,
    );

    expect(
      ZeroInputFlowEligibility.isEligible(
        value,
        provider: 'mtn',
        transactionType: 'check_momo_balance',
        businessSimRole: 'agent',
        bundleCategory: 'daily',
      ),
      isFalse,
    );
  });

  test('rejects mismatched SIM role', () {
    expect(eligible(flow(role: 'merchant')), isFalse);
  });

  test('rejects flow without an authoritative ID', () {
    final value = flow()..remove('id');
    expect(eligible(value), isFalse);
  });

  test('rejects inactive flow', () {
    final value = flow()..['is_active'] = false;
    expect(eligible(value), isFalse);
  });

  test('rejects unsupported execution mode', () {
    expect(eligible(flow(mode: 'unknown')), isFalse);
  });

  test('accepts direct USSD without interactive steps', () {
    expect(
      eligible(flow(mode: 'direct', steps: [])),
      isTrue,
    );
  });

  test('rejects direct USSD with interactive steps', () {
    expect(
      eligible(flow(mode: 'direct')),
      isFalse,
    );
  });

  test('accepts MTN Agent commission enquiries but not separate cash-out commission', () {
    for (final type in ['cash_in_commission', 'commission_balance']) {
      final value = flow()..['transaction_type'] = type;
      expect(
        ZeroInputFlowEligibility.isEligible(
          value,
          provider: 'mtn',
          transactionType: type,
          businessSimRole: 'agent',
        ),
        isTrue,
      );
    }
    final unsupported = flow()..['transaction_type'] = 'cash_out_commission';
    expect(
      ZeroInputFlowEligibility.isEligible(
        unsupported,
        provider: 'mtn',
        transactionType: 'cash_out_commission',
        businessSimRole: 'agent',
      ),
      isFalse,
    );
  });

  test('rejects unsupported transaction types', () {
    final value = flow()
      ..['transaction_type'] = 'send_money';

    expect(
      ZeroInputFlowEligibility.isEligible(
        value,
        provider: 'mtn',
        transactionType: 'send_money',
        businessSimRole: 'agent',
      ),
      isFalse,
    );
  });

  test('rejects mismatched transaction identity', () {
    final value = flow()..['transaction_type'] = 'send_money';
    expect(eligible(value), isFalse);
  });

  test('rejects missing dial code for direct mode', () {
    final value = flow(mode: 'direct', steps: [])
      ..['dial_code'] = '';
    expect(eligible(value), isFalse);
  });
}
