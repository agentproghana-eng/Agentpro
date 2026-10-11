import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both initiation paths clear a stale enquiry lock before persisting',
      () {
    for (final name in [
      'transaction_screen.dart',
      'personal_transaction_screen.dart',
    ]) {
      final source =
          File('lib/features/transactions/$name').readAsStringSync();
      final recover =
          source.indexOf('ZeroInputExecutionSession.recoverStaleEnquiryLock(');
      final persist = source
          .indexOf('await ZeroInputExecutionSession.persistBeforeInitiation(');

      expect(recover, greaterThanOrEqualTo(0), reason: name);
      expect(recover, lessThan(persist), reason: name);
    }
  });
}
