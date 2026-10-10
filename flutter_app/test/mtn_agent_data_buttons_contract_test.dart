import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('MTN Agent Data workspace is role restricted', () {
    expect(
      source,
      contains("bool get _isMtnAgentDataWorkspace =>"),
    );
    expect(
      source,
      contains("_transactionType == 'data_bundle' &&"),
    );
    expect(
      source,
      contains("_selectedBusinessSimRole == 'agent'"),
    );
  });

  test('Data purchase retains existing transaction execution', () {
    final start = source.indexOf(
      'if (_isMtnAgentDataWorkspace) ...[',
    );
    expect(start, greaterThanOrEqualTo(0));

    final end = source.indexOf(
      '// Security/info notice',
      start,
    );
    expect(end, greaterThan(start));

    final section = source.substring(start, end);

    expect(section, contains("label: 'Buy Data'"));
    expect(section, contains('onPressed: _loading ? null : _proceed'));
    expect(section, contains("label: 'Balance'"));
    expect(
      section,
      contains("_showPendingBalanceConfiguration("),
    );
    expect(section, contains("'Data Balance'"));
  });

  test('Other workspaces retain the original primary action', () {
    expect(
      source,
      contains('!_isMtnAgentDataWorkspace &&\n              !_isMtnAgentAirtimeWorkspace &&\n              !_isStandaloneMtnAgentCash)'),
    );
    expect(
      source,
      contains("onPressed: _proceed,"),
    );
  });
}
