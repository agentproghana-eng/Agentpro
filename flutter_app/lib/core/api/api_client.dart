import 'package:dio/dio.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';
import '../services/storage_service.dart';

class ApiClient {
  static const String _baseUrl = 'https://agentpro-production-5ece.up.railway.app/api/v1';
  // For local dev: 'http://10.0.2.2:3000/v1'

  static final Dio _dio = _createDio();
  static Dio get instance => _dio;

  static Dio _createDio() {
    final dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    // Request interceptor: attach JWT
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await StorageService.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (DioException error, handler) async {
        // Auto-refresh on 401
        if (error.response?.statusCode == 401) {
          final refreshed = await _refreshToken();
          if (refreshed) {
            // Retry original request with new token
            final token = await StorageService.getAccessToken();
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            try {
              final response = await dio.fetch(error.requestOptions);
              return handler.resolve(response);
            } catch (_) {}
          }
          // Refresh failed — force logout
          await StorageService.clearSession();
        }
        return handler.next(error);
      },
    ));

    // Logging in debug mode
    assert(() {
      dio.interceptors.add(PrettyDioLogger(
        requestHeader: true,
        requestBody: true,
        responseBody: true,
      ));
      return true;
    }());

    return dio;
  }

  static Future<bool> _refreshToken() async {
    try {
      final refreshToken = await StorageService.getRefreshToken();
      if (refreshToken == null) return false;

      final response = await Dio().post(
        '$_baseUrl/auth/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200) {
        final accessToken = response.data['data']['access_token'];
        await StorageService.saveAccessToken(accessToken);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }
}
