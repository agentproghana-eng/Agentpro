import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'package:agent_pro_ghana/core/services/offline_queue_service.dart';

void main() {
  late Directory hiveDirectory;

  const userACompany1 = OfflineQueueIdentity(
    userId: 'user-a',
    companyId: 'company-1',
  );
  const userBCompany1 = OfflineQueueIdentity(
    userId: 'user-b',
    companyId: 'company-1',
  );
  const userACompany2 = OfflineQueueIdentity(
    userId: 'user-a',
    companyId: 'company-2',
  );
  const userAWithoutCompany = OfflineQueueIdentity(userId: 'user-a');

  setUp(() async {
    hiveDirectory = await Directory.systemTemp.createTemp(
      'agentpro_offline_queue_test_',
    );

    Hive.init(hiveDirectory.path);

    await OfflineQueueService.initializeWithKeyForTesting(
      List<int>.generate(32, (index) => index),
    );
  });

  tearDown(() async {
    await Hive.close();

    if (await hiveDirectory.exists()) {
      await hiveDirectory.delete(recursive: true);
    }
  });

  group('OfflineQueueService identity parsing', () {
    test('extracts user and company identity from authenticated user data', () {
      final identity = OfflineQueueService.identityFromUser({
        'id': 'user-a',
        'company_id': 'company-1',
      });

      expect(identity, isNotNull);
      expect(identity!.userId, 'user-a');
      expect(identity.companyId, 'company-1');
    });

    test('rejects a user map without an id', () {
      expect(
        OfflineQueueService.identityFromUser({'company_id': 'company-1'}),
        isNull,
      );
    });
  });

  group('OfflineQueueService flow cache isolation', () {
    test(
      'Business flow cache is shared only inside the same company',
      () async {
        const flow = <String, dynamic>{
          'dial_code': '*170#',
          'steps': [
            {'action': 'send_digit', 'value': '1'},
          ],
        };

        await OfflineQueueService.cacheFlow(
          'mtn',
          'cash_in',
          flow,
          identity: userACompany1,
          isPersonal: false,
        );

        expect(
          OfflineQueueService.getCachedFlow(
            'mtn',
            'cash_in',
            identity: userBCompany1,
            isPersonal: false,
          ),
          flow,
        );

        expect(
          OfflineQueueService.getCachedFlow(
            'mtn',
            'cash_in',
            identity: userACompany2,
            isPersonal: false,
          ),
          isNull,
        );
      },
    );

    test(
      'Personal flow cache is isolated by user even in same company',
      () async {
        const flow = <String, dynamic>{
          'dial_code': '*110#',
          'steps': [
            {'action': 'send_digit', 'value': '2'},
          ],
        };

        await OfflineQueueService.cacheFlow(
          'telecel',
          'buy_airtime',
          flow,
          identity: userACompany1,
          isPersonal: true,
        );

        expect(
          OfflineQueueService.getCachedFlow(
            'telecel',
            'buy_airtime',
            identity: userACompany1,
            isPersonal: true,
          ),
          flow,
        );

        expect(
          OfflineQueueService.getCachedFlow(
            'telecel',
            'buy_airtime',
            identity: userBCompany1,
            isPersonal: true,
          ),
          isNull,
        );
      },
    );

    test('Personal and Business flow keys cannot collide', () async {
      const personalFlow = <String, dynamic>{
        'dial_code': '*111#',
        'steps': [
          {'action': 'send_digit', 'value': '1'},
        ],
      };

      const businessFlow = <String, dynamic>{
        'dial_code': '*222#',
        'steps': [
          {'action': 'send_digit', 'value': '2'},
        ],
      };

      await OfflineQueueService.cacheFlow(
        'mtn',
        'send_money',
        personalFlow,
        identity: userACompany1,
        isPersonal: true,
      );

      await OfflineQueueService.cacheFlow(
        'mtn',
        'send_money',
        businessFlow,
        identity: userACompany1,
        isPersonal: false,
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'mtn',
          'send_money',
          identity: userACompany1,
          isPersonal: true,
        ),
        personalFlow,
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'mtn',
          'send_money',
          identity: userACompany1,
          isPersonal: false,
        ),
        businessFlow,
      );
    });

    test('Business cache fails closed without a company identity', () async {
      const flow = <String, dynamic>{'dial_code': '*170#'};

      const template = <String, dynamic>{'ussd_string_pattern': '*170*1#'};

      await OfflineQueueService.cacheFlow(
        'mtn',
        'cash_in',
        flow,
        identity: userAWithoutCompany,
        isPersonal: false,
      );

      await OfflineQueueService.cacheTemplate(
        'mtn',
        'cash_in',
        template,
        identity: userAWithoutCompany,
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'mtn',
          'cash_in',
          identity: userAWithoutCompany,
          isPersonal: false,
        ),
        isNull,
      );

      expect(
        OfflineQueueService.getCachedTemplate(
          'mtn',
          'cash_in',
          identity: userAWithoutCompany,
        ),
        isNull,
      );
    });

    test('legacy unscoped flow and template cache keys are ignored', () async {
      final box = Hive.box('cached_ussd_templates_v2');

      await box.put(
        'flow_business_mtn_cash_in_-_-',
        jsonEncode({'dial_code': '*999#'}),
      );

      await box.put(
        'mtn_cash_in',
        jsonEncode({'ussd_string_pattern': '*999#'}),
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'mtn',
          'cash_in',
          identity: userACompany1,
          isPersonal: false,
        ),
        isNull,
      );

      expect(
        OfflineQueueService.getCachedTemplate(
          'mtn',
          'cash_in',
          identity: userACompany1,
        ),
        isNull,
      );
    });

    test('Business template cache is isolated by company', () async {
      const template = <String, dynamic>{'ussd_string_pattern': '*170*1#'};

      await OfflineQueueService.cacheTemplate(
        'mtn',
        'balance_enquiry',
        template,
        identity: userACompany1,
      );

      expect(
        OfflineQueueService.getCachedTemplate(
          'mtn',
          'balance_enquiry',
          identity: userBCompany1,
        ),
        template,
      );

      expect(
        OfflineQueueService.getCachedTemplate(
          'mtn',
          'balance_enquiry',
          identity: userACompany2,
        ),
        isNull,
      );
    });
  });

  group('OfflineQueueService pending queue isolation', () {
    test(
      'Business queue writes fail closed without company identity',
      () async {
        await expectLater(
          OfflineQueueService.queueTransaction(
            identity: userAWithoutCompany,
            requestFields: const {
              'provider': 'mtn',
              'transaction_type': 'cash_in',
            },
            status: 'success',
            sessionLog: const [],
            isPersonal: false,
          ),
          throwsStateError,
        );

        await expectLater(
          OfflineQueueService.queuePendingCompletion(
            identity: userAWithoutCompany,
            transactionId: 'remote-without-company',
            status: 'success',
            sessionLog: const [],
            isPersonal: false,
          ),
          throwsStateError,
        );

        expect(
          OfflineQueueService.getPendingTransactions(userAWithoutCompany),
          isEmpty,
        );
      },
    );

    test(
      'same user and company can read its Business queued transaction',
      () async {
        await OfflineQueueService.queueTransaction(
          identity: userACompany1,
          requestFields: const {
            'provider': 'mtn',
            'transaction_type': 'cash_in',
          },
          status: 'success',
          sessionLog: const [],
          isPersonal: false,
        );

        final pending = OfflineQueueService.getPendingTransactions(
          userACompany1,
        );

        expect(pending, hasLength(1));
        expect(pending.single['owner_user_id'], 'user-a');
        expect(pending.single['owner_company_id'], 'company-1');
        expect(pending.single['is_personal'], isFalse);
      },
    );

    test(
      'another user in the same company cannot read the queued transaction',
      () async {
        await OfflineQueueService.queueTransaction(
          identity: userACompany1,
          requestFields: const {
            'provider': 'mtn',
            'transaction_type': 'cash_in',
          },
          status: 'success',
          sessionLog: const [],
          isPersonal: false,
        );

        expect(
          OfflineQueueService.getPendingTransactions(userBCompany1),
          isEmpty,
        );
      },
    );

    test(
      'same user id in another company cannot read Business queued work',
      () async {
        await OfflineQueueService.queueTransaction(
          identity: userACompany1,
          requestFields: const {
            'provider': 'mtn',
            'transaction_type': 'cash_out',
          },
          status: 'success',
          sessionLog: const [],
          isPersonal: false,
        );

        expect(
          OfflineQueueService.getPendingTransactions(userACompany2),
          isEmpty,
        );
      },
    );

    test(
      'Personal queued work follows the user and stores no company owner',
      () async {
        await OfflineQueueService.queueTransaction(
          identity: userACompany1,
          requestFields: const {
            'provider': 'telecel',
            'transaction_type': 'buy_airtime',
          },
          status: 'success',
          sessionLog: const [],
          isPersonal: true,
        );

        final ownPending = OfflineQueueService.getPendingTransactions(
          userACompany1,
        );

        expect(ownPending, hasLength(1));
        expect(ownPending.single['owner_user_id'], 'user-a');
        expect(ownPending.single['owner_company_id'], isNull);
        expect(ownPending.single['is_personal'], isTrue);

        expect(
          OfflineQueueService.getPendingTransactions(userBCompany1),
          isEmpty,
        );
      },
    );

    test('pending completion records preserve Personal ownership', () async {
      await OfflineQueueService.queuePendingCompletion(
        identity: userACompany1,
        transactionId: 'remote-123',
        status: 'pending_confirmation',
        sessionLog: const [],
        isPersonal: true,
      );

      final pending = OfflineQueueService.getPendingTransactions(userACompany1);

      expect(pending, hasLength(1));
      expect(pending.single['remote_transaction_id'], 'remote-123');
      expect(pending.single['owner_user_id'], 'user-a');
      expect(pending.single['owner_company_id'], isNull);
      expect(pending.single['is_personal'], isTrue);
    });

    test('legacy unowned records are quarantined for every identity', () async {
      final box = Hive.box('offline_transaction_queue_v2');

      await box.put(
        'legacy-local-id',
        jsonEncode({
          'local_id': 'legacy-local-id',
          'request_fields': {'provider': 'mtn', 'transaction_type': 'cash_in'},
          'status': 'success',
          'is_personal': false,
          'queued_at': DateTime.now().toIso8601String(),
          'retry_count': 0,
          'dead_letter': false,
          'synced': false,
        }),
      );

      expect(
        OfflineQueueService.getPendingTransactions(userACompany1),
        isEmpty,
      );

      expect(
        OfflineQueueService.getPendingTransactions(userBCompany1),
        isEmpty,
      );

      expect(
        OfflineQueueService.getPendingTransactions(userACompany2),
        isEmpty,
      );
    });
  });
}
