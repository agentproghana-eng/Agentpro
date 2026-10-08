import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('durable release requires matching backend completion', () {
    final source = File(
      'lib/features/transactions/'
      'transaction_progress_screen.dart',
    ).readAsStringSync();

    expect(source, contains("completionBody['success'] == true"));
    expect(
      source,
      contains("completionData['id']?.toString() == transactionId"),
    );
    expect(
      source,
      contains("completionData['status']?.toString() == statusString"),
    );
    expect(
      source,
      contains('ZeroInputExecutionSession.ownsReservation(token)'),
    );
    expect(
      source,
      contains('definitive &&\n            backendCompletionVerified &&'),
    );
  });
}
