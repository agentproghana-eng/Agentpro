import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The one font used for every home tile label. Saved on this phone.
class TileFontPreference {
  TileFontPreference._();

  static const String defaultFont = 'Sora';
  static const String _key = 'home_tile_font_v1';

  static const List<String> fonts = [
    'Inter',
    'Poppins',
    'Montserrat',
    'Nunito',
    'Rubik',
    'Lexend',
    'Manrope',
    'DM Sans',
    'Outfit',
    'Sora',
  ];

  static final ValueNotifier<String> notifier =
      ValueNotifier<String>(defaultFont);

  static Future<void>? _loading;

  /// Reads the saved choice once. Safe to call from build.
  static Future<void> ensureLoaded() => _loading ??= _load();

  static Future<void> _load() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_key);
      if (saved != null && fonts.contains(saved)) notifier.value = saved;
    } catch (_) {
      // Keep the default font when storage is unavailable.
    }
  }

  static Future<void> select(String font) async {
    if (!fonts.contains(font)) return;
    notifier.value = font;
    try {
      await (await SharedPreferences.getInstance()).setString(_key, font);
    } catch (_) {
      // The choice still applies for this session.
    }
  }

  static TextStyle style(
    String font, {
    required double fontSize,
    required FontWeight fontWeight,
  }) {
    final name = fonts.contains(font) ? font : defaultFont;
    return GoogleFonts.getFont(
      name,
      fontSize: fontSize,
      fontWeight: fontWeight,
    );
  }
}
