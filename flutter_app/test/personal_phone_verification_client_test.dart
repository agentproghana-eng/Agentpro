import 'dart:io';

import 'package:agent_pro_ghana/core/auth/personal_phone_verification_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Dio dio;
  late PersonalPhoneVerificationClient client;

  late String capturedPath;
  late Map<String, dynamic> capturedData;

  setUp(() {
    capturedPath = '';
    capturedData = <String, dynamic>{};

    dio = Dio(
      BaseOptions(
        baseUrl: 'https://example.invalid/api/v1',
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (
          options,
          handler,
        ) {
          capturedPath = options.path;

          capturedData = Map<String, dynamic>.from(
            options.data as Map,
          );

          final isStart = options.path.endsWith(
            '/start',
          );

          handler.resolve(
            Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'success': true,
                'data': isStart
                    ? {
                        'challenge_token': 'challenge-token-1234567890',
                        'expires_in_seconds': 300,
                      }
                    : {
                        'verification_token': 'verification-token-1234567890',
                        'expires_in_seconds': 600,
                      },
              },
            ),
          );
        },
      ),
    );

    client = PersonalPhoneVerificationClient(
      dio: dio,
    );
  });

  tearDown(() {
    dio.close(
      force: true,
    );
  });

  test(
    'start sends phone installation and best-effort ICCID',
    () async {
      final result = await client.start(
        phone: ' 0241234567 ',
        installationId: '11111111-1111-4111-8111-111111111111',
        simIccid: ' 8923301234567890123 ',
      );

      expect(
        capturedPath,
        '/auth/personal-phone-verification/start',
      );

      expect(
        capturedData,
        {
          'phone': '0241234567',
          'installation_id': '11111111-1111-4111-8111-111111111111',
          'sim_iccid': '8923301234567890123',
        },
      );

      expect(
        result.challengeToken,
        'challenge-token-1234567890',
      );

      expect(
        result.expiresInSeconds,
        300,
      );
    },
  );

  test(
    'verify binds OTP to the same phone and SIM identity',
    () async {
      final result = await client.verify(
        challengeToken: ' challenge-token-1234567890 ',
        code: ' 123456 ',
        phone: '0241234567',
        installationId: '11111111-1111-4111-8111-111111111111',
        simIccid: '8923301234567890123',
      );

      expect(
        capturedPath,
        '/auth/personal-phone-verification/verify',
      );

      expect(
        capturedData,
        {
          'challenge_token': 'challenge-token-1234567890',
          'code': '123456',
          'phone': '0241234567',
          'installation_id': '11111111-1111-4111-8111-111111111111',
          'sim_iccid': '8923301234567890123',
        },
      );

      expect(
        result.verificationToken,
        'verification-token-1234567890',
      );

      expect(
        result.expiresInSeconds,
        600,
      );
    },
  );

  test(
    'empty ICCID is omitted while installation identity remains',
    () async {
      await client.start(
        phone: '0241234567',
        installationId: '11111111-1111-4111-8111-111111111111',
        simIccid: ' ',
      );

      expect(
        capturedData.containsKey(
          'sim_iccid',
        ),
        false,
      );

      expect(
        capturedData['installation_id'],
        '11111111-1111-4111-8111-111111111111',
      );
    },
  );

  test(
    'client source does not log OTP or retain it as object state',
    () {
      final source = File(
        'lib/core/auth/personal_phone_verification_client.dart',
      ).readAsStringSync();

      expect(
        source.contains(
          'print(',
        ),
        false,
      );

      expect(
        source.contains(
          'debugPrint(',
        ),
        false,
      );

      expect(
        source.contains(
          'final String code;',
        ),
        false,
      );

      expect(
        source.contains(
          '/auth/personal-phone-verification/start',
        ),
        true,
      );

      expect(
        source.contains(
          '/auth/personal-phone-verification/verify',
        ),
        true,
      );
    },
  );
}
