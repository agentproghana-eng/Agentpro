import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  final accessibilitySource = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/UssdAccessibilityService.kt',
  ).readAsStringSync();

  group('Telecel Personal flow UI contract', () {
    test(
      'unified Telecel Transfer Money supports Same and Other Network',
      () {
        expect(
          source,
          contains(
            'bool get _requiresSendMoneyModeChoice => _isUnifiedSendMoney;',
          ),
        );

        expect(
          source,
          contains(
            "'same_network' => 'send_money_same_network'",
          ),
        );

        expect(
          source,
          contains(
            "'other_network' => 'send_money_cross_network'",
          ),
        );

        expect(
          source,
          contains(
            'bool get _isTelecelCrossNetwork =>',
          ),
        );

        expect(
          source,
          contains(
            "widget.provider == 'telecel'",
          ),
        );

        expect(
          source,
          isNot(
            contains('_isTelecelUnifiedSendMoney'),
          ),
        );

        expect(
          source,
          contains(
            'if (_requiresSendMoneyModeChoice) ...[',
          ),
        );
      },
    );

    test(
      'requires reference for both verified Telecel Send Money modes',
      () {
        final start = source.indexOf(
          'bool get _referenceRequired',
        );

        final end = source.indexOf(
          'bool get _needsTillNumber',
          start,
        );

        expect(start, greaterThanOrEqualTo(0));
        expect(end, greaterThan(start));

        final referenceContract = source.substring(
          start,
          end,
        );

        expect(
          referenceContract,
          contains("widget.provider == 'telecel'"),
        );

        expect(
          referenceContract,
          contains("'send_money_same_network'"),
        );

        expect(
          referenceContract,
          contains("'send_money_cross_network'"),
        );

        expect(
          referenceContract,
          contains('.contains(type)'),
        );
      },
    );

    test('offers all six live Telecel Buy Data categories', () {
      expect(
        source,
        contains('List<DataBundleCategory> get _availableDataBundleCategories'),
      );

      for (final category in const [
        "'flexi'",
        "'2moorch'",
        "'daily'",
        "'weekly'",
        "'monthly'",
        "'night'",
      ]) {
        expect(source, contains(category));
      }

      expect(
        source,
        isNot(contains("category.id == 'daily'")),
      );

      expect(
        source,
        contains(
          'children: _availableDataBundleCategories.map((cat) {',
        ),
      );

      expect(
        source,
        contains('_isTelecelManualDataCategory'),
      );

      expect(
        source,
        contains(
          "widget.provider == 'telecel' && id != 'daily'",
        ),
      );

      expect(
        source,
        contains(
          'Choose the current package, amount or payment',
        ),
      );
    });

    test('changing Telecel package menus stay read-only until PIN', () {
      expect(
        accessibilitySource,
        contains('manualUserSelectionUntilPin'),
      );

      expect(
        accessibilitySource,
        contains('nextStep.actionValue == "until_pin"'),
      );

      expect(
        accessibilitySource,
        contains(
          '"Generic flow: armed read-only manual selection until PIN"',
        ),
      );

      expect(
        accessibilitySource,
        contains(
          'steps[index].action == "pin_prompt"',
        ),
      );

      expect(
        accessibilitySource,
        contains(
          '"pending_confirmation"',
        ),
      );
    });
  });
}
