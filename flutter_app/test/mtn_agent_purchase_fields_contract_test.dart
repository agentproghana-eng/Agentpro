import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('MTN Agent purchase screens bypass server-driven forms', () {
    final start = source.indexOf(
      'bool get _usesServerDrivenForm {',
    );
    final end = source.indexOf(
      'void _updateServerDrivenFormValues(',
      start,
    );

    expect(start, greaterThanOrEqualTo(0));
    expect(end, greaterThan(start));

    final guard = source.substring(start, end);

    expect(
      guard,
      contains('_isMtnAgentAirtimeWorkspace ||'),
    );
    expect(
      guard,
      contains('_isMtnAgentDataWorkspace)'),
    );
  });

  test('Standard Phone Number and Amount fields remain enabled', () {
    expect(
      source,
      contains("_serverDrivenFormOwnsField('customer_phone')"),
    );
    expect(
      source,
      contains('if (!_usesServerDrivenForm &&'),
    );
    expect(
      source,
      contains('_needsAmount) ...['),
    );
  });

  test('MTN Agent purchase workspaces remain role restricted', () {
    expect(
      source,
      contains('bool get _isMtnAgentAirtimeWorkspace =>'),
    );
    expect(
      source,
      contains('bool get _isMtnAgentDataWorkspace =>'),
    );
    expect(
      source,
      contains("_selectedBusinessSimRole == 'agent'"),
    );
  });
}
