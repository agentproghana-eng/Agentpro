import 'package:flutter/material.dart';
import 'app_theme.dart';

extension AppColors on BuildContext {
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  Color get appScaffoldBg =>
      isDarkMode ? AppTheme.darkScaffoldBg : const Color(0xFFF7F9F8);
  Color get appSurface => isDarkMode ? AppTheme.darkSurface : Colors.white;
  Color get appPrimaryText =>
      isDarkMode ? AppTheme.darkPrimaryText : const Color(0xFF1F2933);
  Color get appSecondaryText =>
      isDarkMode ? AppTheme.darkSecondaryText : const Color(0xFF63726E);
  Color get appDivider =>
      isDarkMode ? AppTheme.darkDivider : const Color(0xFFE4EAE8);

  Color appTileColor(Color lightColor) =>
      isDarkMode ? AppTheme.darkTileColor(lightColor) : lightColor;
}
