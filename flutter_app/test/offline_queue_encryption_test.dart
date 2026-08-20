import 'dart:convert';
import 'dart:io';

import 'package:agent_pro_ghana/core/services/offline_queue_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';

void main() {
  late Directory hiveDirectory;

  final encryptionKey = List<int>.generate(32, (index) => index + 1);

  setUp(() async {
    hiveDirectory = await Directory.systemTemp.createTemp(
      'agentpro_offline_encryption_test_',
    );

    Hive.init(hiveDirectory.path);
  });

  tearDown(() async {
    await Hive.close();

    if (await hiveDirectory.exists()) {
      await hiveDirectory.delete(recursive: true);
    }
  });

  test(
    'migrates legacy plaintext queue and cache into encrypted v2 boxes',
    () async {
      const sensitivePhone = '0244123456';

      const queuePayload =
          '{"local_id":"local-existing","request_fields":{"customer_phone":"0244123456"},"synced":false}';

      const templatePayload =
          '{"dial_code":"*170#","owner":"company-1","secret_marker":"offline-sensitive-template"}';

      final legacyQueue = await Hive.openBox('offline_transaction_queue');

      final legacyTemplates = await Hive.openBox('cached_ussd_templates');

      await legacyQueue.put('local-existing', queuePayload);

      await legacyTemplates.put('template-existing', templatePayload);

      await legacyQueue.flush();
      await legacyTemplates.flush();

      await legacyQueue.close();
      await legacyTemplates.close();

      expect(await Hive.boxExists('offline_transaction_queue'), isTrue);

      expect(await Hive.boxExists('cached_ussd_templates'), isTrue);

      await OfflineQueueService.initializeWithKeyForTesting(encryptionKey);

      expect(await Hive.boxExists('offline_transaction_queue'), isFalse);

      expect(await Hive.boxExists('cached_ussd_templates'), isFalse);

      expect(
        Hive.box('offline_transaction_queue_v2').get('local-existing'),
        queuePayload,
      );

      expect(
        Hive.box('cached_ussd_templates_v2').get('template-existing'),
        templatePayload,
      );

      await Hive.box('offline_transaction_queue_v2').flush();

      await Hive.box('cached_ussd_templates_v2').flush();

      await Hive.close();

      final persistedBytes = <int>[];

      await for (final entity in hiveDirectory.list(recursive: true)) {
        if (entity is File) {
          persistedBytes.addAll(await entity.readAsBytes());
        }
      }

      final rawDiskText = latin1.decode(persistedBytes, allowInvalid: true);

      expect(rawDiskText, isNot(contains(sensitivePhone)));

      expect(rawDiskText, isNot(contains('offline-sensitive-template')));

      Hive.init(hiveDirectory.path);

      await OfflineQueueService.initializeWithKeyForTesting(encryptionKey);

      expect(
        Hive.box('offline_transaction_queue_v2').get('local-existing'),
        queuePayload,
      );

      expect(
        Hive.box('cached_ussd_templates_v2').get('template-existing'),
        templatePayload,
      );
    },
  );

  test(
    'encrypted queue cannot be reopened with a different key',
    () async {
      await OfflineQueueService.initializeWithKeyForTesting(
        encryptionKey,
      );

      await Hive.box(
        'offline_transaction_queue_v2',
      ).put(
        'sensitive',
        '{"amount":"100.00"}',
      );

      await Hive.box(
        'offline_transaction_queue_v2',
      ).flush();

      await Hive.close();

      Hive.init(
        hiveDirectory.path,
      );

      final wrongKey = List<int>.generate(
        32,
        (index) => 255 - index,
      );

      await expectLater(
        OfflineQueueService.initializeWithKeyForTesting(
          wrongKey,
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            contains(
              'does not match existing encrypted data',
            ),
          ),
        ),
      );

      expect(
        await Hive.boxExists(
          'offline_transaction_queue_v2',
        ),
        isTrue,
      );

      expect(
        Hive.isBoxOpen(
          'offline_transaction_queue_v2',
        ),
        isFalse,
      );

      await OfflineQueueService.initializeWithKeyForTesting(
        encryptionKey,
      );

      expect(
        Hive.box(
          'offline_transaction_queue_v2',
        ).get(
          'sensitive',
        ),
        '{"amount":"100.00"}',
      );
    },
  );

  test('normal session logout does not destroy the device encryption key', () {
    final storageSource = File(
      'lib/core/services/storage_service.dart',
    ).readAsStringSync();

    final clearSessionStart = storageSource.indexOf(
      'static Future<void> clearSession()',
    );

    final clearSessionEnd = storageSource.indexOf(
      'static Future<void> clearAccessTokenOnly()',
      clearSessionStart,
    );

    expect(clearSessionStart, greaterThanOrEqualTo(0));

    expect(clearSessionEnd, greaterThan(clearSessionStart));

    final clearSessionSource = storageSource.substring(
      clearSessionStart,
      clearSessionEnd,
    );

    expect(storageSource, contains('_keyOfflineQueueEncryptionKey'));

    expect(
      clearSessionSource,
      isNot(contains('_keyOfflineQueueEncryptionKey')),
    );

    final queueSource = File(
      'lib/core/services/offline_queue_service.dart',
    ).readAsStringSync();

    expect(queueSource, contains('HiveAesCipher(encryptionKey)'));

    expect(queueSource, contains('encryptionCipher:'));

    expect(
      queueSource,
      contains(
        'Encrypted offline data exists but its secure-storage key is missing.',
      ),
    );
  });
}
