import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/features/ussd_settings/quick_action_customization_screen.dart',
  ).readAsStringSync();
  final font = File(
    'lib/features/ussd_settings/tile_font_preference.dart',
  ).readAsStringSync();
  final label = File(
    'lib/shared/widgets/fitted_tile_label.dart',
  ).readAsStringSync();
  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();
  final personal = File(
    'lib/features/dashboard/personal_home_screen.dart',
  ).readAsStringSync();

  group('Quick Action menu, tile font and auto save', () {
    test('row menu is a three-line button with an icon-free pop-up', () {
      expect(screen, contains('icon: const Icon(Icons.menu_rounded)'));
      expect(screen, isNot(contains('Icons.palette_outlined')));
      expect(screen, isNot(contains('Icons.format_color_fill_outlined')));
      expect(screen, isNot(contains('Icons.more_vert')));
      for (final entry in [
        "child: Text('Rename')",
        "child: Text('Change icon')",
        "child: Text('Icon colour')",
        "child: Text('Icon background colour')",
        "child: Text('Font')",
      ]) {
        expect(screen, contains(entry));
      }
      expect(screen, contains('color: AppTheme.errorColor'));
      expect(screen, contains('BorderRadius.circular(16)'));
    });

    test('every change saves itself and there is no Save button', () {
      expect(screen, isNot(contains("'Save \$modeLabel Quick Actions'")));
      expect(screen, contains('void _scheduleAutoSave()'));
      expect(
        RegExp(r'_scheduleAutoSave\(\);').allMatches(screen).length,
        greaterThanOrEqualTo(6),
      );
      expect(screen, contains("'All changes saved'"));
      expect(screen, contains("'Not saved. Tap to retry'"));
      expect(screen, contains('void dispose()'));
    });

    test('ten fonts, one choice for every home tile, saved on the phone', () {
      for (final name in [
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
      ]) {
        expect(font, contains("'$name'"));
      }
      expect(font, contains("static const String defaultFont = 'Sora';"));
      expect(font, contains('SharedPreferences'));
      expect(screen, contains('_chooseTileFont'));
    });

    test('home screens reload tiles right after customization saves', () {
      final refresh = File(
        'lib/features/ussd_settings/quick_action_refresh.dart',
      ).readAsStringSync();
      final homeTab = File(
        'lib/features/dashboard/home_tab.dart',
      ).readAsStringSync();

      expect(refresh, contains('static void notifySaved()'));
      expect(screen, contains('QuickActionRefresh.notifySaved();'));
      for (final home in [homeTab, personal]) {
        expect(home, contains('QuickActionRefresh.tick.addListener('));
        expect(home, contains('QuickActionRefresh.tick.removeListener('));
        expect(home, contains('void _onQuickActionsSaved()'));
      }
    });

    test('both home grids use the fitted tile label', () {
      expect(label, contains('class FittedTileLabel'));
      expect(label, contains('fittedSize'));
      expect(dashboard, contains('FittedTileLabel('));
      expect(personal, contains('FittedTileLabel('));
    });
  });
}
