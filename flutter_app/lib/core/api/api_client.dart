import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/storage_service.dart';

enum TokenRefreshOutcome {
  refreshed,
  terminalFailure,
  transientFailure,
}

class ClientCompatibilityBlock {
  final String code;
  final String message;
  final String? minimumSupportedVersion;
  final String? recommendedVersion;

  const ClientCompatibilityBlock({
    required this.code,
    required this.message,
    this.minimumSupportedVersion,
    this.recommendedVersion,
  });
}

class ApiClient {
  static const String _apiContractVersion = '1';

  static final Future<Map<String, String>> _clientHeadersFuture =
      _loadClientHeaders();

  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.agentpro.intellicoresystem.com/api/v1',
  );

  static final Dio _dio = _createDio();

  static final ValueNotifier<ClientCompatibilityBlock?>
      compatibilityBlock =
      ValueNotifier<ClientCompatibilityBlock?>(null);

  static Future<TokenRefreshOutcome>? _refreshFuture;
  static Future<void>? _sessionInvalidationFuture;

  static final StreamController<void> _sessionInvalidationController =
      StreamController<void>.broadcast();

  static Stream<void> get sessionInvalidations =>
      _sessionInvalidationController.stream;

  static Dio get instance => _dio;

  static String _clientPlatform() {
    if (kIsWeb) {
      return 'web';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.macOS:
        return 'macos';
      case TargetPlatform.windows:
        return 'windows';
      case TargetPlatform.linux:
        return 'linux';
      case TargetPlatform.fuchsia:
        return 'fuchsia';
    }
  }

  static Future<Map<String, String>> _loadClientHeaders() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();

      return <String, String>{
        'X-AgentPro-App-Version': packageInfo.version,
        'X-AgentPro-App-Build': packageInfo.buildNumber,
        'X-AgentPro-Platform': _clientPlatform(),
        'X-AgentPro-API-Version': _apiContractVersion,
      };
    } catch (_) {
      // Compatibility metadata must never become a new reason that the app
      // cannot reach AgentPro. If local package metadata is unavailable,
      // omit the entire compatibility header set so the backend treats this
      // request as a legacy-supported client during the migration period.
      return const <String, String>{};
    }
  }

  static Future<Map<String, String>> _clientHeaders() {
    return _clientHeadersFuture;
  }

  static Dio _createDio() {
    final dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    // Request interceptor: attach JWT
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final sessionLocked = await StorageService.isSessionLocked();
          final isAuthRequest = options.path.contains('/auth/');

          // A locally locked AgentPro session must not generate background
          // API traffic. Interactive authentication endpoints remain
          // available so the user can deliberately sign in or recover an
          // account when they choose to use internet connectivity.
          if (sessionLocked && !isAuthRequest) {
            return handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.cancel,
                error: 'SESSION_LOCKED',
              ),
            );
          }

          options.headers.addAll(
            await _clientHeaders(),
          );

          final token = StorageService.getCachedAccessToken() ??
              await StorageService.getAccessToken();

          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          return handler.next(options);
        },
        onResponse: (response, handler) async {
          final trustAccepted = response.headers.value(
                'x-agentpro-offline-trust',
              ) ==
              '1';

          final trustVersion = response.headers.value(
            'x-agentpro-offline-trust-version',
          );

          final mode = response.headers
              .value(
                'x-agentpro-offline-trust-mode',
              )
              ?.trim();

          final serverUserId = response.headers
              .value(
                'x-agentpro-offline-trust-user-id',
              )
              ?.trim();

          final serverSessionId = response.headers
              .value(
                'x-agentpro-offline-trust-session-id',
              )
              ?.trim();

          final verifiedAt = DateTime.tryParse(
            response.headers.value(
                  'x-agentpro-offline-trust-verified-at',
                ) ??
                '',
          )?.toUtc();

          final authorizedUntil = DateTime.tryParse(
            response.headers.value(
                  'x-agentpro-offline-trust-authorized-until',
                ) ??
                '',
          )?.toUtc();

          final personalPaid = response.headers.value(
                'x-agentpro-offline-trust-personal-paid',
              ) ==
              '1';

          final personalPaidUntilHeader = response.headers.value(
            'x-agentpro-offline-trust-personal-paid-until',
          );

          final personalPaidUntil = personalPaidUntilHeader == null
              ? null
              : DateTime.tryParse(
                  personalPaidUntilHeader,
                )?.toUtc();

          final statusCode = response.statusCode ?? 0;

          if (trustAccepted &&
              trustVersion == '2' &&
              mode != null &&
              mode.isNotEmpty &&
              serverUserId != null &&
              serverUserId.isNotEmpty &&
              serverSessionId != null &&
              serverSessionId.isNotEmpty &&
              verifiedAt != null &&
              authorizedUntil != null &&
              statusCode >= 200 &&
              statusCode < 300) {
            await StorageService.markServerVerified(
              mode: mode,
              serverUserId: serverUserId,
              serverSessionId: serverSessionId,
              serverVerifiedAt: verifiedAt,
              authorizedUntil: authorizedUntil,
              personalPaid: personalPaid,
              personalPaidUntil: personalPaidUntil,
            );
          }

          return handler.next(response);
        },
        onError: (DioException error, handler) async {
          _captureCompatibilityBlock(error);

          final request = error.requestOptions;
          final isUnauthorized = error.response?.statusCode == 401;
          final alreadyRetried = request.extra['auth_refresh_retried'] == true;
          final isAuthRequest = request.path.contains('/auth/login') ||
              request.path.contains('/auth/register') ||
              request.path.contains('/auth/refresh');

          final sessionLocked = await StorageService.isSessionLocked();
          final currentAccessToken = await StorageService.getAccessToken();
          final canRefresh = !sessionLocked &&
              currentAccessToken != null &&
              currentAccessToken.isNotEmpty;

          if (isUnauthorized &&
              canRefresh &&
              !alreadyRetried &&
              !isAuthRequest) {
            request.extra['auth_refresh_retried'] = true;

            final failedAuthorization =
                request.headers['Authorization']?.toString();

            final latestAccessToken =
                await StorageService.getAccessToken();

            final latestAuthorization =
                latestAccessToken == null || latestAccessToken.isEmpty
                    ? null
                    : 'Bearer $latestAccessToken';

            // Another request may already have refreshed the session while
            // this request was in flight. If the failed request used an older
            // token, retry once with the newer stored token instead of
            // launching another refresh request.
            if (latestAuthorization != null &&
                failedAuthorization != latestAuthorization) {
              request.headers['Authorization'] =
                  latestAuthorization;

              try {
                final response = await dio.fetch(request);
                return handler.resolve(response);
              } on DioException catch (retryError) {
                return handler.next(retryError);
              }
            }

            final refreshOutcome = await _refreshTokenWithOutcome();

            if (refreshOutcome == TokenRefreshOutcome.refreshed) {
              final token = await StorageService.getAccessToken();

              if (token != null && token.isNotEmpty) {
                request.headers['Authorization'] = 'Bearer $token';

                try {
                  final response = await dio.fetch(request);
                  return handler.resolve(response);
                } on DioException catch (retryError) {
                  return handler.next(retryError);
                }
              }
            }

            if (refreshOutcome == TokenRefreshOutcome.terminalFailure) {
              await _invalidateSession();
            }
          }

          return handler.next(error);
        },
      ),
    );

    return dio;
  }

  static void _captureCompatibilityBlock(
    DioException error,
  ) {
    if (error.response?.statusCode != 426) {
      return;
    }

    final payload = error.response?.data;

    if (payload is! Map) {
      return;
    }

    final code = payload['code']?.toString().trim();

    if (code != 'UPDATE_REQUIRED' &&
        code != 'API_INCOMPATIBLE') {
      return;
    }

    final compatibility = payload['compatibility'];

    String? minimumSupportedVersion;
    String? recommendedVersion;

    if (compatibility is Map) {
      minimumSupportedVersion =
          compatibility['minimum_supported_app_version']
              ?.toString()
              .trim();

      recommendedVersion =
          compatibility['recommended_app_version']
              ?.toString()
              .trim();
    }

    final serverMessage =
        payload['message']?.toString().trim();

    compatibilityBlock.value = ClientCompatibilityBlock(
      code: code!,
      message: serverMessage == null || serverMessage.isEmpty
          ? 'This version of AgentPro can no longer connect safely.'
          : serverMessage,
      minimumSupportedVersion:
          minimumSupportedVersion == null ||
                  minimumSupportedVersion.isEmpty
              ? null
              : minimumSupportedVersion,
      recommendedVersion:
          recommendedVersion == null ||
                  recommendedVersion.isEmpty
              ? null
              : recommendedVersion,
    );
  }

  static Future<void> _invalidateSession() {
    final existing = _sessionInvalidationFuture;

    if (existing != null) {
      return existing;
    }

    final invalidation = _performSessionInvalidation();
    _sessionInvalidationFuture = invalidation;

    return invalidation.whenComplete(() {
      if (identical(
        _sessionInvalidationFuture,
        invalidation,
      )) {
        _sessionInvalidationFuture = null;
      }
    });
  }

  static Future<void> _performSessionInvalidation() async {
    final accessToken = await StorageService.getAccessToken();
    final refreshToken = await StorageService.getRefreshToken();
    final user = await StorageService.getUser();

    final hasAccessToken = accessToken != null && accessToken.isNotEmpty;

    final hasRefreshToken = refreshToken != null && refreshToken.isNotEmpty;

    if (!hasAccessToken && !hasRefreshToken && user == null) {
      return;
    }

    await StorageService.clearSession();
    _sessionInvalidationController.add(null);
  }

  static Future<bool> refreshToken() async {
    final outcome = await _refreshTokenWithOutcome();

    return outcome == TokenRefreshOutcome.refreshed;
  }

  static Future<TokenRefreshOutcome> _refreshTokenWithOutcome() {
    final existingRefresh = _refreshFuture;

    if (existingRefresh != null) {
      return existingRefresh;
    }

    final refresh = _performTokenRefresh();
    _refreshFuture = refresh;

    return refresh.whenComplete(() {
      if (identical(_refreshFuture, refresh)) {
        _refreshFuture = null;
      }
    });
  }

  static bool _isTerminalRefreshStatus(
    int? statusCode,
  ) {
    return statusCode == 401 || statusCode == 403;
  }

  static Future<TokenRefreshOutcome> _performTokenRefresh() async {
    try {
      final storedRefreshToken = await StorageService.getRefreshToken();

      if (storedRefreshToken == null || storedRefreshToken.isEmpty) {
        return TokenRefreshOutcome.terminalFailure;
      }

      final compatibilityHeaders =
          await _clientHeaders();

      final response = await Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: <String, dynamic>{
            'Content-Type': 'application/json',
            ...compatibilityHeaders,
          },
          validateStatus: (_) => true,
        ),
      ).post(
        '$_baseUrl/auth/refresh',
        data: {
          'refresh_token': storedRefreshToken,
        },
      );

      final statusCode = response.statusCode;

      if (_isTerminalRefreshStatus(statusCode)) {
        return TokenRefreshOutcome.terminalFailure;
      }

      if (statusCode != 200) {
        return TokenRefreshOutcome.transientFailure;
      }

      final responseData = response.data;

      if (responseData is! Map) {
        return TokenRefreshOutcome.transientFailure;
      }

      final data = responseData['data'];

      if (data is! Map) {
        return TokenRefreshOutcome.transientFailure;
      }

      final accessToken = data['access_token'];

      if (accessToken is! String || accessToken.isEmpty) {
        return TokenRefreshOutcome.transientFailure;
      }

      await StorageService.saveAccessToken(accessToken);

      final rotatedRefreshToken = data['refresh_token'];

      if (rotatedRefreshToken is String && rotatedRefreshToken.isNotEmpty) {
        await StorageService.saveRefreshToken(
          rotatedRefreshToken,
        );
      }

      return TokenRefreshOutcome.refreshed;
    } on DioException {
      return TokenRefreshOutcome.transientFailure;
    } catch (_) {
      return TokenRefreshOutcome.transientFailure;
    }
  }
}
