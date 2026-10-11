import 'dart:io';

import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_draft_validation.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> flow(List<Map<String, dynamic>> steps) => {
      'owner_user_id': null,
      'company_id': null,
      'provider': 'mtn',
      'transaction_type': 'allow_cash_out',
      'dial_code': '*170#',
      'steps': steps,
    };

Map<String, dynamic> digit(String value) =>
    {'action': 'send_digit', 'action_value': value, 'match_all': ['x']};

bool trusted(Map<String, dynamic> data, {String dial = '*170#'}) =>
    isTrustedPinlessPersonalRuntimeFlow(
      isPersonal: true,
      provider: 'mtn',
      transactionType: 'allow_cash_out',
      dialCode: dial,
      flowData: data,
    );

void main() {
  test('MTN Allow Cash Out is trusted PIN-less only as *170# -> 4 -> 1', () {
    expect(trusted(flow([digit('4'), digit('1')])), isTrue);

    // Any deviation falls back to the normal PIN boundary.
    expect(trusted(flow([digit('4')])), isFalse);
    expect(trusted(flow([digit('4'), digit('2')])), isFalse);
    expect(
      trusted(flow([
        digit('4'),
        {'action': 'send_amount', 'action_value': '1', 'match_all': ['x']},
      ])),
      isFalse,
    );
    expect(trusted(flow([digit('4'), digit('1')]), dial: '*171#'), isFalse);
  });

  test('screens and reports know the new type', () {
    final screen = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();
    final reports = File(
      'lib/features/reports/personal_reports_screen.dart',
    ).readAsStringSync();

    expect(screen, contains("'allow_cash_out': 'Allow Cash Out'"));
    expect(
      RegExp(r"kNoAmountPersonalTypes = \[[^\]]*'allow_cash_out'")
          .hasMatch(screen),
      isTrue,
    );
    expect(reports, contains("'allow_cash_out': 'Allow Cash Out'"));
    expect(screen, contains("'my_approvals': 'My Approvals'"));
    expect(
      RegExp(r"kNoAmountPersonalTypes = \[[^\]]*'my_approvals'")
          .hasMatch(screen),
      isTrue,
    );
    expect(reports, contains("'my_approvals': 'My Approvals'"));
  });
}
