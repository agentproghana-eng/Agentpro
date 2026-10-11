import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String read(String path) => File(path).readAsStringSync();

  test('every tile grid and the customization list swap tiles', () {
    final business = read(
      'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
    );
    final personal = read('lib/features/dashboard/personal_home_screen.dart');
    final customization = read(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    );

    expect(business, contains('SwappableTile('));
    expect(business, contains('swapQuickActionOrder('));
    expect(personal, contains('SwappableTile('));
    expect(personal, contains('swapQuickActionOrder('));
    expect(customization, contains('items[oldIndex] = items[newIndex];'));
  });

  test('a tile is held to lift and dropped on another to swap', () {
    final swap = read('lib/features/ussd_settings/quick_action_swap.dart');

    expect(swap, contains('LongPressDraggable<String>'));
    expect(swap, contains('DragTarget<String>'));
    expect(swap, contains('onAcceptWithDetails'));
  });
}
