import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('zero-input reservation storage uses the same options as StorageService',
      () {
    final session = File(
      'lib/features/transactions/zero_input_execution_session.dart',
    ).readAsStringSync();
    final storage = File('lib/core/services/storage_service.dart')
        .readAsStringSync();

    for (final option in [
      'encryptedSharedPreferences: true',
      'KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding',
      'StorageCipherAlgorithm.AES_GCM_NoPadding',
    ]) {
      expect(storage, contains(option));
      expect(session, contains(option));
    }
    expect(session, isNot(contains('= FlutterSecureStorage();')));
  });
}
