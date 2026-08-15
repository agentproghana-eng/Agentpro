import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final detail = File(
    'lib/features/marketplace/ad_detail_screen.dart',
  ).readAsStringSync();

  test('fullscreen paging locks while the active image is zoomed', () {
    expect(
      detail,
      contains('bool _currentImageZoomed = false;'),
    );

    expect(
      detail,
      contains(
        'physics: _currentImageZoomed\n'
        '                  ? const NeverScrollableScrollPhysics()\n'
        '                  : null,',
      ),
    );

    expect(
      detail,
      contains(
        'onZoomChanged: (zoomed) {\n'
        '                    _handleZoomChanged(index, zoomed);',
      ),
    );
  });

  test('zoom state follows the real InteractiveViewer transform', () {
    expect(
      detail,
      contains(
        '_controller.value.getMaxScaleOnAxis() > _zoomThreshold',
      ),
    );

    expect(
      detail,
      contains(
        'onInteractionUpdate: (_) => _reportZoomState(),',
      ),
    );

    expect(
      detail,
      contains(
        'onInteractionEnd: (_) => _reportZoomState(),',
      ),
    );

    expect(
      detail,
      isNot(contains('bool _zoomed = false;')),
    );
  });

  test('double tap zoom keeps the tapped point fixed', () {
    expect(
      detail,
      contains('onDoubleTapDown: (details) {'),
    );

    expect(
      detail,
      contains(
        'final position = _doubleTapDetails?.localPosition;',
      ),
    );

    expect(
      detail,
      contains(
        '-position.dx * translationScale,',
      ),
    );

    expect(
      detail,
      contains(
        '-position.dy * translationScale,',
      ),
    );

    expect(
      detail,
      isNot(
        contains(
          'Matrix4.diagonal3Values(2.5, 2.5, 1)',
        ),
      ),
    );
  });

  test('leaving a gallery page resets its zoom transform', () {
    expect(
      detail,
      contains(
        'if (oldWidget.isActive && !widget.isActive) {',
      ),
    );

    expect(
      detail,
      contains(
        '_controller.value = Matrix4.identity();',
      ),
    );

    expect(
      detail,
      contains(
        '_currentImageZoomed = false;',
      ),
    );
  });
}
