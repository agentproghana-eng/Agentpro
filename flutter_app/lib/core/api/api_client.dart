import 'package:dio/dio.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';
import '../services/storage_service.dart';

class ApiClient {
  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://agentpro-api-izi3.onrender.com/api/v1',
  );

  static final Dio _dio = _createDio();
  static Future<bool>? _refreshFuture;

  static Dio get instance => _dio;

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
          final token = StorageService.getCachedAccessToken() ??
              await StorageService.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final request = error.requestOptions;
          final isUnauthorized = error.response?.statusCode == 401;
          final alreadyRetried = request.extra['auth_refresh_retried'] == true;
          final isAuthRequest = request.path.contains('/auth/login') ||
              request.path.contains('/auth/register') ||
              request.path.contains('/auth/refresh');

          if (isUnauthorized && !alreadyRetried && !isAuthRequest) {
            request.extra['auth_refresh_retried'] = true;

            final refreshed = await refreshToken();

            if (refreshed) {
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

            await StorageService.clearSession();
          }

          return handler.next(error);
        },
      ),
    );

    // Logging in debug mode
    assert(() {
      dio.interceptors.add(
        PrettyDioLogger(
          requestHeader: true,
          requestBody: true,
          responseBody: true,
        ),
      );
      return true;
    }());

    return dio;
  }

  static Future<bool> refreshToken() {
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

  static Future<bool> _performTokenRefresh() async {
    try {
      final storedRefreshToken = await StorageService.getRefreshToken();

      if (storedRefreshToken == null || storedRefreshToken.isEmpty) {
        return false;
      }

      final response = await Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        ),
      ).post(
        '$_baseUrl/auth/refresh',
        data: {'refresh_token': storedRefreshToken},
      );

      if (response.statusCode != 200) {
        return false;
      }

      final responseData = response.data;

      if (responseData is! Map) {
        return false;
      }

      final data = responseData['data'];

      if (data is! Map) {
        return false;
      }

      final accessToken = data['access_token'];

      if (accessToken is! String || accessToken.isEmpty) {
        return false;
      }

      await StorageService.saveAccessToken(accessToken);

      final rotatedRefreshToken = data['refresh_token'];

      if (rotatedRefreshToken is String && rotatedRefreshToken.isNotEmpty) {
        await StorageService.saveRefreshToken(
          rotatedRefreshToken,
        );
      }

      return true;
    } on DioException {
      return false;
    } catch (_) {
      return false;
    }
  }
}
