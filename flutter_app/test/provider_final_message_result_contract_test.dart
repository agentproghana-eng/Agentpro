import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();
  final ussd = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();
  final channel = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'UssdAccessibilityChannel.kt',
  ).readAsStringSync();

  group('provider final message is shown to the user', () {
    test('native passes it to Flutter and Flutter parses it', () {
      expect(channel, contains('args["provider_message"] = providerMessage'));
      expect(ussd, contains("args['provider_message']"));
      expect(ussd, contains('providerMessage: providerMessage,'));
    });

    test('the result page shows a Message from provider card', () {
      expect(progress, contains("'Message from \$providerLabel'"));
      expect(progress, contains('_providerMessage!.trim()'));
      expect(progress, contains('_providerMessage = result.providerMessage;'));
    });

    test('it is display-only: never reported, logged or stored', () {
      final report = progress.split('Future<void> _reportResult(')[1];
      // The server payload and the offline queue never carry it.
      expect(report.contains("'provider_message'"), isFalse);
      expect(report.contains('providerMessage:'), isFalse);
      final model = ussd.split('class USSDResult')[1].split('class USSDEngine')[0];
      expect(model, contains('Kept in memory'));
    });
  });
}
