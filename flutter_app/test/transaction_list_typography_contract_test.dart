import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final recent = File(
    'lib/features/dashboard/widgets/'
    'dashboard_recent_transaction_item.dart',
  ).readAsStringSync();

  final history = File(
    'lib/features/transactions/transaction_history_screen.dart',
  ).readAsStringSync();

  final personal = File(
    'lib/shared/widgets/personal_transaction_item.dart',
  ).readAsStringSync();

  group('transaction list typography', () {
    test('business recent phone matches amount prominence', () {
      final phone = recent.indexOf(
        r"${transaction['customer_phone'] ?? ''}",
      );

      expect(phone, greaterThan(-1));

      final phoneBlock = recent.substring(
        phone,
        recent.indexOf('if (time.isNotEmpty)', phone),
      );

      expect(phoneBlock, contains('fontSize: 12.5'));
      expect(
        phoneBlock,
        contains('fontWeight: FontWeight.bold'),
      );

      expect(
        recent,
        contains('fontSize: 12.5'),
      );
    });

    test('business recent time remains metadata', () {
      final time = recent.indexOf('if (time.isNotEmpty)');

      expect(time, greaterThan(-1));

      final block = recent.substring(
        time,
        recent.indexOf('),', time) + 2,
      );

      expect(block, contains('fontSize: 10.5'));
    });

    test('business history phone matches 13px amount', () {
      expect(
        history,
        contains(
          "final customerPhone =\n"
          "        tx['customer_phone']?.toString().trim() ?? '';",
        ),
      );

      final phone = history.indexOf(
        'if (customerPhone.isNotEmpty)',
      );

      expect(phone, greaterThan(-1));

      final block = history.substring(
        phone,
        history.indexOf(
          'if (metadataParts.isNotEmpty)',
          phone,
        ),
      );

      expect(block, contains('fontSize: 13'));
      expect(
        block,
        contains('fontWeight: FontWeight.w600'),
      );

      expect(
        history,
        contains('GhsAmount(amount: amount, fontSize: 13)'),
      );
    });

    test('business history metadata stays smaller', () {
      final metadata = history.indexOf(
        'if (metadataParts.isNotEmpty)',
      );

      expect(metadata, greaterThan(-1));

      final block = history.substring(
        metadata,
        history.indexOf('],', metadata),
      );

      expect(block, contains('fontSize: 11'));
    });

    test('personal phone matches amount prominence', () {
      final phone = personal.indexOf(
        r"${tx['recipient_phone'] ?? ''}",
      );

      expect(phone, greaterThan(-1));

      final block = personal.substring(
        phone,
        personal.indexOf(
          'if (timeStr.isNotEmpty)',
          phone,
        ),
      );

      expect(block, contains('fontSize: 12.5'));
      expect(
        block,
        contains('fontWeight: FontWeight.bold'),
      );

      expect(
        personal,
        contains('fontSize: 12.5, fontWeight: FontWeight.bold'),
      );
    });

    test('personal time remains smaller metadata', () {
      final time = personal.indexOf(
        'if (timeStr.isNotEmpty)',
      );

      expect(time, greaterThan(-1));

      final block = personal.substring(
        time,
        personal.indexOf(')),', time) + 3,
      );

      expect(block, contains('fontSize: 10.5'));
    });
  });
}
