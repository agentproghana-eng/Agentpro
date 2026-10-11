import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final router = File('lib/core/router/app_router.dart').readAsStringSync();
  final screen = File('lib/features/transactions/transaction_screen.dart')
      .readAsStringSync();

  test('auto-start quick actions open on a transparent, instant page', () {
    final route = router
        .split("path: '/transactions',")[1]
        .split("path: '/personal-transactions/new',")[0];
    expect(route, contains('pageBuilder:'));
    expect(route, contains('opaque: false'));
    expect(route, contains('transitionDuration: Duration.zero'));
    expect(route, contains('reverseTransitionDuration: Duration.zero'));
    expect(
      route,
      contains(
        'autoStart &&\n                ZeroInputDirectExecutionPolicy.supportedTypes.contains(type)',
      ),
    );
    expect(route, contains('return MaterialPage<void>(key: state.pageKey, child: screen);'));
  });

  test('the screen shows nothing of its own while it prepares to dial', () {
    expect(screen, contains('bool get _autoStartRunsSilently =>'));
    expect(screen, contains('(!_simDetectionComplete || _loading || _autoStartInProgress);'));
    expect(screen, contains('if (_autoStartRunsSilently) {'));
    expect(screen, contains('backgroundColor: Colors.transparent'));
    expect(screen, contains('AbsorbPointer(child: SizedBox.expand())'));
  });

  test('problems and the form fallback still show after a failed start', () {
    final getter = screen
        .split('bool get _autoStartRunsSilently =>')[1]
        .split('@override')[0];
    expect(getter, contains('!_autoStartFallbackToForm'));
    expect(getter, contains('widget.autoStart'));
  });
}
