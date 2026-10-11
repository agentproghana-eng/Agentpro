import 'package:flutter/material.dart';

import '../../features/ussd_settings/tile_font_preference.dart';

/// Home tile label in the font chosen under Quick Action customization. Wide
/// faces shrink in half-point steps (never below [minFontSize]) until the
/// longest word fits the tile width. "COMMISSIONS" is the longest word on the
/// home grids.
class FittedTileLabel extends StatelessWidget {
  final String text;
  final double maxFontSize;
  final double minFontSize;
  final FontWeight fontWeight;
  final int maxLines;

  const FittedTileLabel(
    this.text, {
    super.key,
    required this.maxFontSize,
    this.minFontSize = 8,
    this.fontWeight = FontWeight.w700,
    this.maxLines = 2,
  });

  /// Largest size, between [minFontSize] and [maxFontSize], at which the
  /// longest word in [text] fits [maxWidth].
  static double fittedSize({
    required String text,
    required String font,
    required double maxWidth,
    required double maxFontSize,
    required double minFontSize,
    required FontWeight fontWeight,
    required TextDirection textDirection,
  }) {
    final words = text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    var size = maxFontSize;
    while (size > minFontSize) {
      var fits = true;
      for (final word in words) {
        final painter = TextPainter(
          text: TextSpan(
            text: word,
            style: TileFontPreference.style(
              font,
              fontSize: size,
              fontWeight: fontWeight,
            ),
          ),
          textDirection: textDirection,
          maxLines: 1,
        )..layout();
        if (painter.width > maxWidth) {
          fits = false;
          break;
        }
      }
      if (fits) return size;
      size -= 0.5;
    }
    return minFontSize;
  }

  @override
  Widget build(BuildContext context) {
    TileFontPreference.ensureLoaded();
    final direction = Directionality.of(context);
    return ValueListenableBuilder<String>(
      valueListenable: TileFontPreference.notifier,
      builder: (context, font, _) => LayoutBuilder(
        builder: (context, constraints) {
          final size = constraints.maxWidth.isFinite
              ? fittedSize(
                  text: text,
                  font: font,
                  maxWidth: constraints.maxWidth,
                  maxFontSize: maxFontSize,
                  minFontSize: minFontSize,
                  fontWeight: fontWeight,
                  textDirection: direction,
                )
              : maxFontSize;
          return Text(
            text,
            textAlign: TextAlign.center,
            maxLines: maxLines,
            overflow: TextOverflow.ellipsis,
            style: TileFontPreference.style(
              font,
              fontSize: size,
              fontWeight: fontWeight,
            ),
          );
        },
      ),
    );
  }
}
