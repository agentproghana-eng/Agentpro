import 'package:dio/dio.dart';

import '../api/api_client.dart';

class PersonalPhoneVerificationStartResult {
  final String challengeToken;
  final int expiresInSeconds;

  const PersonalPhoneVerificationStartResult({
    required this.challengeToken,
    required this.expiresInSeconds,
  });
}

class PersonalPhoneVerificationCompleteResult {
  final String verificationToken;
  final int expiresInSeconds;

  const PersonalPhoneVerificationCompleteResult({
    required this.verificationToken,
    required this.expiresInSeconds,
  });
}

class PersonalPhoneVerificationClient {
  final Dio _dio;

  PersonalPhoneVerificationClient({
    Dio? dio,
  }) : _dio = dio ?? ApiClient.instance;

  Map<String, dynamic> _responsePayload(
    Response<dynamic> response,
  ) {
    final rawEnvelope = response.data;

    if ((rawEnvelope is Map) == false) {
      throw const FormatException(
        'Verification response is malformed.',
      );
    }

    final envelope = Map<String, dynamic>.from(
      rawEnvelope as Map,
    );

    final rawPayload = envelope['data'];

    if ((rawPayload is Map) == false) {
      throw const FormatException(
        'Verification response data is malformed.',
      );
    }

    return Map<String, dynamic>.from(
      rawPayload as Map,
    );
  }

  String _requiredToken(
    Map<String, dynamic> payload,
    String key,
  ) {
    final token = payload[key]?.toString().trim() ?? '';

    if (token.isEmpty) {
      throw const FormatException(
        'Verification token is missing.',
      );
    }

    return token;
  }

  int _requiredExpiry(
    Map<String, dynamic> payload,
  ) {
    final raw = payload['expires_in_seconds'];

    final value = raw is int
        ? raw
        : int.tryParse(
            raw?.toString() ?? '',
          );

    if (value == null || value <= 0) {
      throw const FormatException(
        'Verification expiry is invalid.',
      );
    }

    return value;
  }

  Future<PersonalPhoneVerificationStartResult> start({
    required String phone,
    required String installationId,
    String? simIccid,
  }) async {
    final response = await _dio.post(
      '/auth/personal-phone-verification/start',
      data: {
        'phone': phone.trim(),
        'installation_id': installationId.trim(),
        if (simIccid?.trim().isNotEmpty == true) 'sim_iccid': simIccid?.trim(),
      },
    );

    final payload = _responsePayload(
      response,
    );

    return PersonalPhoneVerificationStartResult(
      challengeToken: _requiredToken(
        payload,
        'challenge_token',
      ),
      expiresInSeconds: _requiredExpiry(
        payload,
      ),
    );
  }

  Future<PersonalPhoneVerificationCompleteResult> verify({
    required String challengeToken,
    required String code,
    required String phone,
    required String installationId,
    String? simIccid,
  }) async {
    final response = await _dio.post(
      '/auth/personal-phone-verification/verify',
      data: {
        'challenge_token': challengeToken.trim(),
        'code': code.trim(),
        'phone': phone.trim(),
        'installation_id': installationId.trim(),
        if (simIccid?.trim().isNotEmpty == true) 'sim_iccid': simIccid?.trim(),
      },
    );

    final payload = _responsePayload(
      response,
    );

    return PersonalPhoneVerificationCompleteResult(
      verificationToken: _requiredToken(
        payload,
        'verification_token',
      ),
      expiresInSeconds: _requiredExpiry(
        payload,
      ),
    );
  }
}
