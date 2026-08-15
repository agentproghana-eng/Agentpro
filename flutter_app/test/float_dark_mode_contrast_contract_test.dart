import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final widgets = File(
    'lib/shared/widgets/app_widgets.dart',
  ).readAsStringSync();

  final floatScreen = File(
    'lib/features/float/float_screen.dart',
  ).readAsStringSync();

  final floatRequests = File(
    'lib/features/float/float_requests_screen.dart',
  ).readAsStringSync();

  test('GHS amounts use the active theme primary color', () {
    final marker = widgets.indexOf('class GhsAmount');

    expect(marker, greaterThanOrEqualTo(0));

    final ghsAmount = widgets.substring(marker);

    expect(
      ghsAmount,
      contains(
        'color ?? Theme.of(context).colorScheme.primary',
      ),
    );

    expect(
      RegExp(r'color: resolvedColor,').allMatches(ghsAmount).length,
      2,
    );
  });

  test('Float summary and low-balance text stay readable', () {
    expect(floatScreen, isNot(contains('Colors.white60')));
    expect(floatScreen, isNot(contains('Colors.white70')));

    expect(
      floatScreen,
      contains(
        'final lowColor = Theme.of(context).colorScheme.error;',
      ),
    );

    expect(
      floatScreen,
      contains(
        'color: isLow ? lowColor : context.appSecondaryText,',
      ),
    );

    expect(
      floatScreen,
      contains('color: isLow ? lowColor : null,'),
    );
  });

  test('Float custom teal actions always use white foreground', () {
    expect(
      RegExp(r'foregroundColor: Colors\.white,').allMatches(floatScreen).length,
      1,
    );

    expect(
      RegExp(r'foregroundColor: Colors\.white,')
          .allMatches(floatRequests)
          .length,
      3,
    );
  });

  test('Inline Float errors use theme-aware error color', () {
    expect(
      floatScreen,
      contains(
        'color: Theme.of(context).colorScheme.error,',
      ),
    );

    expect(
      floatRequests,
      contains(
        'color: Theme.of(context).colorScheme.error,',
      ),
    );
  });

  test('post-sheet context is guarded after async navigation', () {
    expect(
      floatScreen,
      contains(
        'if (completed == true && context.mounted) {',
      ),
    );
  });
}
