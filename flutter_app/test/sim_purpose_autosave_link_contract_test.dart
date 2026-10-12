import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final settings = File(
    'lib/features/settings/sim_purpose_settings_screen.dart',
  ).readAsStringSync();
  final quick = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();
  final home = File(
    'lib/features/dashboard/home_tab.dart',
  ).readAsStringSync();

  group('SIM Purpose links and auto-saves', () {
    test('the SIM role required card opens SIM Purpose', () {
      expect(quick, contains("actionLabel: 'Set SIM role'"));
      expect(quick, contains("context.push('/settings/sim-purpose')"));
    });

    test('Home reloads SIM roles when the user returns', () {
      expect(home, contains('void didPopNext()'));
      expect(home, contains('unawaited(_loadSimPurposes());'));
    });

    test('choosing a role saves that SIM immediately', () {
      expect(settings, contains('onTap: () => _saveSlot(card, option),'));
      expect(settings, isNot(contains("label: 'Save SIM Roles'")));
    });

    test('only the tapped SIM is sent and defaults are never auto-saved', () {
      final save = settings.split('Future<void> _saveSlot(')[1].split(
            'String _networkLabel',
          )[0];
      expect(save, contains("'sim_slot': card.slot,"));
      expect(save, isNot(contains('_simCards.map')));
      // Nothing saves on load: the only caller is the role option tap.
      expect(
        RegExp(r'_saveSlot\(').allMatches(settings).length,
        2, // definition + the single tap handler
      );
    });

    test('server acceptance precedes local trust and failure restores', () {
      final save = settings.split('Future<void> _saveSlot(')[1];
      final server = save.indexOf("'/user-sim-purposes'");
      final cache = save.indexOf('SimRoleAssignmentService.cacheRoleForSlot(');
      expect(server, greaterThanOrEqualTo(0));
      expect(cache, greaterThan(server));
      expect(save, contains('_roles[card.slot] = previous;'));
    });
  });
}
