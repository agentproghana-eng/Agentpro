import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('SIM detection triggers role resolution without provider change', () {
    final detectionStart = source.indexOf(
      'final available = supportedSims',
    );
    expect(detectionStart, greaterThanOrEqualTo(0));

    final detectionEnd = source.indexOf(
      'if (ZeroInputDirectExecutionPolicy.supportedTypes.contains',
      detectionStart,
    );
    expect(detectionEnd, greaterThan(detectionStart));

    final detectionSection = source.substring(
      detectionStart,
      detectionEnd,
    );

    expect(
      detectionSection,
      contains(
        'if (_selectedSim != null) {\n'
        '        _scheduleFlowPreload(immediate: true);\n'
        '      }',
      ),
    );

    expect(
      detectionSection,
      isNot(contains('if (providerChanged) {\n'
          '        _scheduleFlowPreload();')),
    );
  });

  test('role resolution retains authoritative verification', () {
    final preloadStart = source.indexOf(
      'Future<void> _preloadSelectedFlow() async {',
    );
    expect(preloadStart, greaterThanOrEqualTo(0));

    final preloadEnd = source.indexOf(
      'void _selectProvider(',
      preloadStart,
    );
    expect(preloadEnd, greaterThan(preloadStart));

    final preloadSection = source.substring(
      preloadStart,
      preloadEnd,
    );

    expect(
      preloadSection,
      contains('allowLegacyAgentFallback: false'),
    );
    expect(
      preloadSection,
      contains('_selectedBusinessSimRole = businessSimRole'),
    );
  });
}
