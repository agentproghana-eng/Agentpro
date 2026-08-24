import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Quick Action customization upgrade contracts', () {
    final preference = File(
      'lib/features/ussd_settings/quick_action_preference.dart',
    ).readAsStringSync();

    final customization = File(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    ).readAsStringSync();

    final dashboard = File(
      'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
    ).readAsStringSync();

    test('persists icon background colour separately from icon colour', () {
      expect(preference, contains('iconBackgroundColorHex'));
      expect(preference, contains("'icon_background_color'"));
      expect(preference, contains('resolvedIconBackgroundColor'));

      expect(customization, contains('Change Icon Colour'));
      expect(
        customization,
        contains('Change Icon Background Colour'),
      );
      expect(
        customization,
        contains('Change icon background colour'),
      );
    });

    test('dashboard applies custom colour only to icon background', () {
      expect(
        dashboard,
        contains('preference.resolvedIconBackgroundColor('),
      );

      // The full Quick Action card remains theme-controlled.
      expect(
        dashboard,
        contains('color: context.appSurface'),
      );

      // The small icon container continues to own bgColor.
      expect(
        dashboard,
        contains('color: widget.bgColor'),
      );
    });

    test('selected actions have an explicit persisted reorder affordance', () {
      expect(
        customization,
        contains('buildDefaultDragHandles: false'),
      );
      expect(
        customization,
        contains('ReorderableDragStartListener'),
      );
      expect(
        customization,
        contains('Icons.drag_handle_rounded'),
      );
      expect(
        customization,
        contains('if (newIndex > oldIndex)'),
      );

      expect(
        dashboard,
        contains(
          'a.position.compareTo(b.position)',
        ),
      );
    });
  });
}
