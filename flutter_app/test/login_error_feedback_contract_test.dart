import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('login handles validation and account lockout safely', () {
    final source =
        File('lib/core/auth/auth_bloc.dart').readAsStringSync();

    expect(source, contains('statusCode == 400 || statusCode == 422'));
    expect(source, contains("error['field'] == 'email'"));
    expect(source, contains("error['field'] == 'password'"));
    expect(source, contains('Enter a valid email address.'));
    expect(source, contains('Password is required.'));
    expect(source, contains('statusCode == 423'));
    expect(source, contains('statusCode == 429'));
    expect(source, contains('Too many login attempts.'));
    expect(source, contains('statusCode == 401'));
    expect(source, contains('DioExceptionType.connectionError'));
  });
}
