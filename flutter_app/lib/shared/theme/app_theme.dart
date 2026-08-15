import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // AgentPro Ghana — premium teal + gold identity.
  static const Color primaryColor = Color(0xFF00695C); // AgentPro Deep Teal
  static const Color primaryDeep = Color(0xFF004D40);
  static const Color primaryLight = Color(0xFF4FD1C5);
  static const Color secondaryColor = Color(0xFFC9A227); // AgentPro Gold

  static const Color errorColor = Color(0xFFBA1A1A);
  static const Color successColor = Color(0xFF2E7D32);
  static const Color warningColor = Color(0xFFE65100);

  static const Color mtnColor = Color(0xFFFFCC00);
  static const Color telecelColor = Color(0xFFE31837);
  static const Color atColor = Color(0xFF003087);

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: primaryColor,
      brightness: Brightness.light,
    ).copyWith(
      primary: primaryColor,
      onPrimary: Colors.white,
      secondary: secondaryColor,
      onSecondary: const Color(0xFF1F2933),
      error: errorColor,
      surface: Colors.white,
      onSurface: const Color(0xFF1F2933),
      surfaceContainerHighest: const Color(0xFFF0F5F3),
      outline: const Color(0xFFD8E1DE),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFFF7F9F8),
      textTheme: GoogleFonts.interTextTheme(ThemeData.light().textTheme).apply(
        bodyColor: const Color(0xFF1F2933),
        displayColor: const Color(0xFF1F2933),
      ),
      iconTheme: const IconThemeData(color: primaryDeep),
      appBarTheme: AppBarTheme(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          color: secondaryColor,
          fontSize: 19,
          fontWeight: FontWeight.w700,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 54),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primaryColor,
          side: const BorderSide(color: Color(0xFFB7C8C3), width: 1.2),
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: primaryColor),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        labelStyle: const TextStyle(color: Color(0xFF52615D)),
        hintStyle: const TextStyle(color: Color(0xFF8A9793)),
        prefixIconColor: primaryDeep,
        suffixIconColor: const Color(0xFF52615D),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD8E1DE)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD8E1DE)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: primaryColor, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: errorColor),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        color: Colors.white,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFFE4EAE8)),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFF1F5F4),
        selectedColor: const Color(0xFFDCEEE9),
        disabledColor: const Color(0xFFF1F1F1),
        checkmarkColor: primaryColor,
        labelStyle: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: const Color(0xFF37474F),
        ),
        secondaryLabelStyle: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: primaryDeep,
        ),
        side: const BorderSide(color: Color(0xFFB7C8C3)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        textColor: Color(0xFF1F2933),
        iconColor: primaryColor,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: primaryColor,
        unselectedItemColor: Color(0xFF7B8784),
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dividerTheme:
          const DividerThemeData(color: Color(0xFFE4EAE8), thickness: 1),
    );
  }

  static const Color darkScaffoldBg = Color(0xFF061F1C);
  static const Color darkSurface = Color(0xFF0B2A26);
  static const Color darkPrimaryText = Color(0xFFF4F8F7);
  static const Color darkSecondaryText = Color(0xFFC3CECB);
  static const Color darkDivider = Color(0xFF24453F);
  static const Color darkErrorColor = Color(0xFFEF5350);

  static ThemeData get darkTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: primaryColor,
      brightness: Brightness.dark,
    ).copyWith(
      primary: primaryLight,
      secondary: secondaryColor,
      error: darkErrorColor,
      surface: darkSurface,
      onSurface: darkPrimaryText,
      surfaceContainerHighest: const Color(0xFF143832),
      outline: darkDivider,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: darkScaffoldBg,
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).apply(
        bodyColor: darkPrimaryText,
        displayColor: darkPrimaryText,
      ),
      iconTheme: const IconThemeData(color: primaryLight),
      appBarTheme: AppBarTheme(
        backgroundColor: primaryDeep,
        foregroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          color: secondaryColor,
          fontSize: 19,
          fontWeight: FontWeight.w700,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 54),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primaryLight,
          side: const BorderSide(color: darkDivider, width: 1.2),
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: primaryLight),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkSurface,
        labelStyle: const TextStyle(color: darkSecondaryText),
        hintStyle: const TextStyle(color: Color(0xFF7F9A93)),
        prefixIconColor: primaryLight,
        suffixIconColor: darkSecondaryText,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: darkDivider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: darkDivider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: primaryLight, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: darkErrorColor),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        color: darkSurface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: darkDivider),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFF143832),
        selectedColor: const Color(0xFF194B43),
        checkmarkColor: primaryLight,
        labelStyle: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: darkPrimaryText,
        ),
        side: const BorderSide(color: darkDivider),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: darkSurface,
        selectedItemColor: primaryLight,
        unselectedItemColor: darkSecondaryText,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: darkSurface,
        contentTextStyle: GoogleFonts.inter(color: darkPrimaryText),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dividerTheme: const DividerThemeData(color: darkDivider, thickness: 1),
    );
  }

  static Color darkTileColor(Color light) {
    const map = {
      0xFFE6F4F1: Color(0xFF113B34),
      0xFFFDF3DC: Color(0xFF332B15),
      0xFFE3EEFC: Color(0xFF17263D),
      0xFFF0E6FA: Color(0xFF2A1F35),
      0xFFFCE8E3: Color(0xFF332019),
      0xFFFFF7D6: Color(0xFF332E15),
      0xFFE0F7F5: Color(0xFF0F3934),
      0xFFDFF3EE: Color(0xFF12372F),
      0xFFFBE6EC: Color(0xFF2E1B21),
    };
    return map[light.toARGB32()] ?? darkSurface;
  }

  static Color statusColor(String status) {
    switch (status) {
      case 'success':
        return successColor;
      case 'failed':
        return errorColor;
      case 'processing':
      case 'pending_confirmation':
        return warningColor;
      case 'reversed':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  static Color providerColor(String provider) {
    switch (provider) {
      case 'mtn':
        return mtnColor;
      case 'telecel':
        return telecelColor;
      case 'at_money':
        return atColor;
      default:
        return primaryColor;
    }
  }
}
