import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_draft_validation.dart';

Map<String, dynamic> step(
  String action, {
  String? value,
  List<String> matchAll = const ['screen marker'],
}) {
  return <String, dynamic>{
    'match_all': matchAll,
    'action': action,
    'action_value': value,
  };
}

Map<String, dynamic> trustedPulseFlow() {
  return <String, dynamic>{
    'owner_user_id': null,
    'company_id': null,
    'provider': 'mtn',
    'transaction_type': 'check_airtime_balance',
    'dial_code': '*567#',
  };
}

void main() {
  group('PIN-less Personal runtime safety', () {
    test('ordinary validation still requires PIN Prompt', () {
      final error = validateUssdFlowDraftSteps(
        <Map<String, dynamic>>[
          step('send_digit', value: '1'),
        ],
      );

      expect(error, contains('exactly one PIN Prompt'));
    });

    test('explicit pinless mode accepts safe Pulse steps', () {
      final error = validateUssdFlowDraftSteps(
        <Map<String, dynamic>>[
          step('send_digit', value: '1'),
          step('send_digit', value: '99'),
          step('send_digit', value: '7'),
        ],
        allowPinless: true,
      );

      expect(error, isNull);
    });

    test('pinless mode still rejects Auto-Confirm Once', () {
      final error = validateUssdFlowDraftSteps(
        <Map<String, dynamic>>[
          step('send_digit', value: '1'),
          step('auto_confirm_once', value: '1'),
        ],
        allowPinless: true,
      );

      expect(error, contains('requires a PIN Prompt'));
    });

    test('pinless mode does not bypass normal step validation', () {
      final error = validateUssdFlowDraftSteps(
        <Map<String, dynamic>>[
          step(
            'send_digit',
            value: '1',
            matchAll: const [''],
          ),
        ],
        allowPinless: true,
      );

      expect(error, isNotNull);
      expect(error, contains('screen match'));
    });

    test('exact global Personal MTN Pulse flow is trusted', () {
      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: trustedPulseFlow(),
        ),
        isTrue,
      );
    });

    test('Personal-owned Pulse override stays PIN-bound', () {
      final flow = trustedPulseFlow()..['owner_user_id'] = 'user-123';

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: flow,
        ),
        isFalse,
      );
    });

    test('company-owned Pulse flow stays PIN-bound', () {
      final flow = trustedPulseFlow()..['company_id'] = 'company-123';

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: flow,
        ),
        isFalse,
      );
    });

    test('missing ownership metadata fails closed', () {
      final missingOwner = trustedPulseFlow()..remove('owner_user_id');

      final missingCompany = trustedPulseFlow()..remove('company_id');

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: missingOwner,
        ),
        isFalse,
      );

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: missingCompany,
        ),
        isFalse,
      );
    });

    test('different context is never trusted', () {
      final flow = trustedPulseFlow();

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: false,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: flow,
        ),
        isFalse,
      );

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'telecel',
          transactionType: 'check_airtime_balance',
          dialCode: '*567#',
          flowData: flow,
        ),
        isFalse,
      );

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_momo_balance',
          dialCode: '*567#',
          flowData: flow,
        ),
        isFalse,
      );

      expect(
        isTrustedPinlessPersonalRuntimeFlow(
          isPersonal: true,
          provider: 'mtn',
          transactionType: 'check_airtime_balance',
          dialCode: '*170#',
          flowData: flow,
        ),
        isFalse,
      );
    });

    test('returned flow metadata must independently match', () {
      final wrongProvider = trustedPulseFlow()..['provider'] = 'telecel';

      final wrongType = trustedPulseFlow()
        ..['transaction_type'] = 'check_momo_balance';

      final wrongDial = trustedPulseFlow()..['dial_code'] = '*170#';

      for (final flow in <Map<String, dynamic>>[
        wrongProvider,
        wrongType,
        wrongDial,
      ]) {
        expect(
          isTrustedPinlessPersonalRuntimeFlow(
            isPersonal: true,
            provider: 'mtn',
            transactionType: 'check_airtime_balance',
            dialCode: '*567#',
            flowData: flow,
          ),
          isFalse,
        );
      }
    });

    test('final device boundary explicitly uses trusted pinless guard', () {
      final source = File(
        'lib/features/transactions/'
        'transaction_progress_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('isTrustedPinlessPersonalRuntimeFlow('),
      );

      expect(
        source,
        contains('allowPinless: allowPinless'),
      );

      expect(
        source,
        contains('flowData: flowData'),
      );
    });
  });
}
