import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_preference.dart';
import 'package:agent_pro_ghana/features/ussd_settings/quick_action_swap.dart';

void main() {
  QuickActionPreference p(String key, int position) =>
      QuickActionPreference(actionKey: key, position: position);

  List<String> keys(List<QuickActionPreference> list) =>
      list.map((item) => item.actionKey).toList();

  test('swaps two tiles and renumbers positions', () {
    final shown = [p('a', 0), p('b', 1), p('c', 2)];

    final result = swapQuickActionOrder(
      displayed: shown,
      saved: shown,
      fromKey: shown[0].identityKey,
      toKey: shown[2].identityKey,
    );

    expect(keys(result), ['c', 'b', 'a']);
    expect(result.map((item) => item.position), [0, 1, 2]);
  });

  test('hidden saved entries stay after the shown ones', () {
    final shown = [p('a', 0), p('b', 1)];
    final saved = [p('a', 0), p('hidden', 1), p('b', 2)];

    final result = swapQuickActionOrder(
      displayed: shown,
      saved: saved,
      fromKey: shown[0].identityKey,
      toKey: shown[1].identityKey,
    );

    expect(keys(result), ['b', 'a', 'hidden']);
  });

  test('dropping a tile on itself changes nothing', () {
    final shown = [p('a', 0), p('b', 1)];

    final result = swapQuickActionOrder(
      displayed: shown,
      saved: shown,
      fromKey: shown[0].identityKey,
      toKey: shown[0].identityKey,
    );

    expect(keys(result), ['a', 'b']);
  });
}
