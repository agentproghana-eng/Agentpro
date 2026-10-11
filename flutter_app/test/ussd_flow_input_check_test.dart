import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/features/transactions/ussd_flow_input_check.dart';

List<Map<String, dynamic>> steps(List<String> actions) =>
    actions.map((a) => <String, dynamic>{'action': a}).toList();

void main() {
  group('missingUssdFlowInput', () {
    test('passes when every typed value is present', () {
      expect(
        missingUssdFlowInput(
          steps: steps(['send_digit', 'send_customer_phone', 'send_amount']),
          params: {'customer_phone': '0241234567', 'amount': '10'},
          transactionType: 'cash_out',
        ),
        isNull,
      );
    });

    test('reports a missing phone, amount, reference, merchant, account', () {
      String? check(String action, Map<String, String> params,
          [String type = 'cash_out']) {
        return missingUssdFlowInput(
          steps: steps([action]),
          params: params,
          transactionType: type,
        );
      }

      expect(check('send_customer_phone', {'customer_phone': ' '}),
          'phone number');
      expect(check('send_amount', {'amount': '0'}), 'amount');
      expect(check('send_amount', {}), 'amount');
      expect(check('send_reference', {'payment_reference': ''}), 'reference');
      expect(check('send_merchant_id', {}), 'merchant ID');
      expect(check('send_account_number', {}), 'account number');
    });

    test('Send Money uses the recipient number', () {
      expect(
        missingUssdFlowInput(
          steps: steps(['send_customer_phone']),
          params: {'customer_phone': '', 'recipient_phone': '0241234567'},
          transactionType: 'send_money',
        ),
        isNull,
      );
      expect(
        missingUssdFlowInput(
          steps: steps(['send_customer_phone']),
          params: {'customer_phone': '0241234567', 'recipient_phone': ''},
          transactionType: 'send_money_same_network',
        ),
        'phone number',
      );
    });

    test('flows without input steps need nothing', () {
      expect(
        missingUssdFlowInput(
          steps: steps(['send_digit', 'pin_prompt']),
          params: const {},
          transactionType: 'balance_enquiry',
        ),
        isNull,
      );
    });
  });

  group('ussdFlowNeedsProtectedCredential', () {
    test('detects Operator ID and shortcode steps', () {
      expect(
        ussdFlowNeedsProtectedCredential({'steps': steps(['send_operator_id'])}),
        isTrue,
      );
      expect(
        ussdFlowNeedsProtectedCredential(
            {'steps': steps(['send_organisation_shortcode'])}),
        isTrue,
      );
      expect(
        ussdFlowNeedsProtectedCredential({'steps': steps(['send_amount'])}),
        isFalse,
      );
      expect(ussdFlowNeedsProtectedCredential(null), isFalse);
    });
  });
}
