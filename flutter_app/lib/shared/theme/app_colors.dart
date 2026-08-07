import 'package:flutter/material.dart';
import 'app_theme.dart';

// Context-aware color lookups for the handful of things almost every
// screen hardcodes (card/surface background, primary/secondary text,
// dividers). Screens should use these instead of writing
// Colors.white / Colors.grey / a raw hex directly, so they
// automatically adapt when the device is in dark mode instead of
// staying stuck in light-mode colors regardless of system setting.
extension AppColors on BuildContext {
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  Color get appScaffoldBg =>
      isDarkMode ? AppTheme.darkScaffoldBg : const Color(0xFFF5F5F5);
  Color get appSurface => isDarkMode ? AppTheme.darkSurface : Colors.white;
  Color get appPrimaryText =>
      isDarkMode ? AppTheme.darkPrimaryText : Colors.black87;
  Color get appSecondaryText =>
      isDarkMode ? AppTheme.darkSecondaryText : Colors.grey;
  Color get appDivider =>
      isDarkMode ? AppTheme.darkDivider : Colors.grey.shade200;

  // For the app's specific pastel tile backgrounds (Home screen quick
  // actions, etc.) - pass the existing light-mode Color literal in,
  // get back the right one for the current theme.
  Color appTileColor(Color lightColor) =>
      isDarkMode ? AppTheme.darkTileColor(lightColor) : lightColor;
}
