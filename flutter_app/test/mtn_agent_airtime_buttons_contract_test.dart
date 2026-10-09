import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('MTN Agent Airtime workspace is role isolated', () {
    expect(
      source,
      contains(
        "bool get _isMtnAgentAirtimeWorkspace =>\n"
        "      _selectedProvider == 'mtn' &&\n"
        "      _transactionType == 'airtime' &&\n"
        "      _selectedBusinessSimRole == 'agent';",
      ),
    );
  });

  test('Buy Airtime executes the existing transaction', () {
    final start = source.indexOf(
      'if (_isMtnAgentAirtimeWorkspace) ...[',
    );
    final end = source.indexOf(
      'if (_isMtnPayToWorkspace) ...[',
      start,
    );

    expect(start, greaterThanOrEqualTo(0));
    expect(end, greaterThan(start));

    final section = source.substring(start, end);

    expect(section, contains("label: 'Buy Airtime'"));
    expect(section, contains('onPressed: _loading ? null : _proceed'));
    expect(section, contains('isLoading: _loading'));
    expect(section, contains("label: 'Airtime Balance'"));
    expect(section, contains('onPressed: null'));
  });

  test('Airtime replaces the default Proceed action', () {
    expect(
      source,
      contains(
        '!_isMtnPayToWorkspace &&\n'
        '              !_isMtnAgentDataWorkspace &&\n'
        '              !_isMtnAgentAirtimeWorkspace)',
      ),
    );
  });
}
