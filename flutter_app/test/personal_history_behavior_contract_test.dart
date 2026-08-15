import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file: $path',
  );

  return file.readAsStringSync();
}

void main() {
  group('Personal History behavior contracts', () {
    test(
      'provider and transaction filters use dynamic catalog data',
      () {
        final source = _readSource(
          'lib/features/transactions/'
          'personal_transaction_history_screen.dart',
        );

        expect(
          source,
          contains('QuickActionCatalog? _catalog;'),
        );

        expect(
          source,
          contains('QuickActionCatalog.load('),
        );

        expect(
          source,
          contains("mode: 'personal'"),
        );

        expect(
          source,
          contains('quickActionProviderLabel'),
        );

        expect(
          source,
          contains('quickActionTransactionLabel'),
        );

        expect(
          source,
          isNot(contains('static const _providers')),
        );

        expect(
          source,
          isNot(contains('static const _types')),
        );
      },
    );

    test(
      'loaded historical values remain valid filter choices',
      () {
        final source = _readSource(
          'lib/features/transactions/'
          'personal_transaction_history_screen.dart',
        );

        expect(
          source,
          contains(
            "(row['provider'] ?? '').toString().trim()",
          ),
        );

        expect(
          source,
          contains(
            "(row['transaction_type'] ?? '')"
            ".toString().trim()",
          ),
        );

        expect(
          source,
          contains('providers.add(_providerFilter)'),
        );

        expect(
          source,
          contains(
            "labels.putIfAbsent(\n"
            "        _typeFilter,",
          ),
        );
      },
    );

    test(
      'new searches and filters invalidate stale responses',
      () {
        final source = _readSource(
          'lib/features/transactions/'
          'personal_transaction_history_screen.dart',
        );

        expect(
          source,
          contains('int _requestGeneration = 0;'),
        );

        expect(
          source,
          contains(
            'final requestGeneration = '
            '++_requestGeneration;',
          ),
        );

        expect(
          source,
          contains(
            'requestGeneration != _requestGeneration',
          ),
        );

        expect(
          source,
          contains(
            'final requestGeneration = '
            '_requestGeneration;',
          ),
        );
      },
    );

    test(
      'unknown Personal transaction types use dynamic label and icon fallbacks',
      () {
        final source = _readSource(
          'lib/shared/widgets/'
          'personal_transaction_item.dart',
        );

        expect(
          source,
          contains('quickActionCatalogIcon(type)'),
        );

        expect(
          source,
          contains(
            'quickActionTransactionLabel(type)',
          ),
        );
      },
    );
  });
}
