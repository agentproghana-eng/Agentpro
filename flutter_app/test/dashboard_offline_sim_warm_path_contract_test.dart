import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _methodBlock(
  String source,
  String signature,
  String nextSignature,
) {
  final start = source.indexOf(signature);

  if (start < 0) {
    throw StateError('Missing signature: $signature');
  }

  final end = source.indexOf(
    nextSignature,
    start + signature.length,
  );

  if (end < 0) {
    throw StateError('Missing end signature: $nextSignature');
  }

  return source.substring(start, end);
}

void main() {
  group('Dashboard offline SIM warm-path contract', () {
    final simService = File(
      'lib/core/services/sim_card_service.dart',
    ).readAsStringSync();

    final businessHome = File(
      'lib/features/dashboard/home_tab.dart',
    ).readAsStringSync();

    final personalHome = File(
      'lib/features/dashboard/personal_home_screen.dart',
    ).readAsStringSync();

    final transactionPrep = File(
      'lib/core/services/transaction_device_preparation_service.dart',
    ).readAsStringSync();

    test('UI SIM observation is warm but execution remains fresh', () {
      expect(
        simService,
        contains(
          'static const Duration _snapshotTtl = '
          'Duration(minutes: 5);',
        ),
      );

      expect(
        transactionPrep,
        contains(
          'SimCardService.getSimCards(\n'
          '        forceRefresh: true,\n'
          '      )',
        ),
      );
    });

    test('Business Home return never redetects hardware SIM', () {
      final block = _methodBlock(
        businessHome,
        '  void didPopNext() {',
        '  @override\n  void initState()',
      );

      expect(
        block,
        isNot(contains('_loadSimMap()')),
      );

      expect(
        block,
        contains(
          '_loadQuickActions(\n'
          '        allowNetwork: false,',
        ),
      );

      expect(
        block,
        contains('_loadSimPurposes()'),
      );
    });

    test('Business SIM purpose renders trusted cache before network', () {
      final loadBlock = _methodBlock(
        businessHome,
        '  Future<void> _loadSimPurposes() async {',
        '  Future<void> _loadFeatureFlags()',
      );

      expect(
        loadBlock,
        contains('refreshFromServer: false'),
      );

      expect(
        loadBlock,
        contains(
          '_refreshSimPurposesFromServer(',
        ),
      );

      final cachedIndex = loadBlock.indexOf(
        'refreshFromServer: false',
      );

      final reconcileIndex = loadBlock.indexOf(
        '_refreshSimPurposesFromServer(',
      );

      expect(
        reconcileIndex,
        greaterThan(cachedIndex),
      );

      final refreshBlock = _methodBlock(
        businessHome,
        '  Future<void> _refreshSimPurposesFromServer(',
        '  Future<void> _loadSimPurposes() async {',
      );

      expect(
        refreshBlock,
        contains('refreshFromServer: true'),
      );

      expect(
        refreshBlock,
        contains(
          'A failed background refresh must never erase',
        ),
      );
    });

    test('Personal Home return avoids full context reload', () {
      final block = _methodBlock(
        personalHome,
        '  void didPopNext() {',
        '  Future<void> _refreshPersonalContext()',
      );

      expect(
        block,
        isNot(contains('_refreshPersonalContext()')),
      );

      expect(
        block,
        contains('_loadSimMap()'),
      );

      expect(
        block,
        contains(
          '_loadQuickActions(\n'
          '        allowNetwork: false,',
        ),
      );

      expect(
        block,
        contains('_loadRecent()'),
      );
    });

    test('Personal SIM purpose is local-first', () {
      final loadBlock = _methodBlock(
        personalHome,
        '  Future<void> _loadSimMap() async {',
        '  @override\n  Widget build(',
      );

      final cachedIndex = loadBlock.indexOf(
        'refreshFromServer: false',
      );

      final serverIndex = loadBlock.indexOf(
        'refreshFromServer: true',
      );

      expect(
        cachedIndex,
        greaterThanOrEqualTo(0),
      );

      expect(
        serverIndex,
        greaterThan(cachedIndex),
      );
    });

    test('return-path Quick Actions are cache-only', () {
      expect(
        businessHome,
        contains('bool allowNetwork = true'),
      );

      expect(
        personalHome,
        contains('bool allowNetwork = true'),
      );

      expect(
        businessHome,
        contains('if (!allowNetwork)'),
      );

      expect(
        personalHome,
        contains('if (!allowNetwork)'),
      );
    });
  });
}
