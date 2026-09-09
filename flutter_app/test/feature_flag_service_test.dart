import 'package:flutter_test/flutter_test.dart';

import 'package:agentpro/core/services/feature_flag_service.dart';

void main() {
  group('normalizeDisabledTransactionTypes', () {
    test('normalizes valid provider operation keys', () {
      expect(
        normalizeDisabledTransactionTypes(
          <dynamic>[
            ' TELECEL:CASH_OUT ',
            'mtn:cash_in',
            'telecel:cash_out',
          ],
        ),
        <String>{
          'telecel:cash_out',
          'mtn:cash_in',
        },
      );
    });

    test('accepts an empty disabled list', () {
      expect(
        normalizeDisabledTransactionTypes(<dynamic>[]),
        isEmpty,
      );
    });

    test('rejects malformed response shapes', () {
      expect(
        normalizeDisabledTransactionTypes(
          <String, dynamic>{
            'telecel:cash_out': true,
          },
        ),
        isNull,
      );
    });

    test('rejects non-string entries', () {
      expect(
        normalizeDisabledTransactionTypes(
          <dynamic>[
            'telecel:cash_out',
            123,
          ],
        ),
        isNull,
      );
    });

    test('rejects malformed provider operation keys', () {
      expect(
        normalizeDisabledTransactionTypes(
          <dynamic>[
            'telecel cash out',
          ],
        ),
        isNull,
      );
    });
  });
}
