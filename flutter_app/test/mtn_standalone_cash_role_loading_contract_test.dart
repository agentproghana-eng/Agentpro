import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('standalone MTN Cash In/Out waits on a loading state, not a form', () {
    expect(source, contains('bool get _awaitingStandaloneMtnCashRole'));
    expect(source, contains('_awaitingStandaloneMtnCashRole\n          ? Center('));
    // The Proceed bar lives in the form branch, which is not built while
    // the loading state is showing.
  });

  test('loading gate ends once the role resolves or fails', () {
    final start = source.indexOf('bool get _awaitingStandaloneMtnCashRole');
    final end = source.indexOf('bool get _mtnPurchaseRoleReady');
    final getter = source.substring(start, end);
    expect(getter, contains('_selectedBusinessSimRole == null'));
    expect(getter, contains('_businessRoleResolutionError == null'));
  });
}
