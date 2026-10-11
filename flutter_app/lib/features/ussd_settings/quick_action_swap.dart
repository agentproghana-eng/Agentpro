import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api/api_client.dart';
import 'quick_action_preference.dart';

/// The preference field that stores a role's Quick Actions.
String quickActionPreferenceField(String role) => switch (role) {
      'subscriber' => 'subscriber_quick_actions',
      'evd' => 'evd_quick_actions',
      'merchant' => 'merchant_quick_actions',
      _ => 'agent_quick_actions',
    };

/// Swaps two tiles. [displayed] is the order the user sees; [saved] adds any
/// hidden or overflow entries, which keep their place after the shown ones.
/// Returns the full list with positions renumbered from 0.
List<QuickActionPreference> swapQuickActionOrder({
  required List<QuickActionPreference> displayed,
  required List<QuickActionPreference> saved,
  required String fromKey,
  required String toKey,
}) {
  final order = List<QuickActionPreference>.from(displayed);
  final from = order.indexWhere((item) => item.identityKey == fromKey);
  final to = order.indexWhere((item) => item.identityKey == toKey);

  if (from < 0 || to < 0 || from == to) {
    return List<QuickActionPreference>.from(saved.isEmpty ? displayed : saved);
  }

  final moved = order[from];
  order[from] = order[to];
  order[to] = moved;

  final shown = order.map((item) => item.identityKey).toSet();
  final rest = saved.where((item) => !shown.contains(item.identityKey));

  return <QuickActionPreference>[...order, ...rest]
      .asMap()
      .entries
      // The server accepts positions 0 to 8 only.
      .map((entry) => entry.value.copyWith(
            position: entry.key > 8 ? 8 : entry.key,
          ))
      .toList();
}

/// Saves a role's whole Quick Action profile. Returns false on failure.
Future<bool> saveQuickActionProfile({
  required String role,
  required Map<String, List<QuickActionPreference>> profile,
}) async {
  try {
    await ApiClient.instance.patch(
      '/users/me/quick-actions',
      data: {
        quickActionPreferenceField(role): {
          for (final entry in profile.entries)
            entry.key: entry.value.map((item) => item.toJson()).toList(),
        },
      },
    );
    return true;
  } catch (_) {
    return false;
  }
}

/// Wraps a tile so it can be held, lifted and dropped on another tile to swap
/// places. A plain tap still reaches the tile underneath.
class SwappableTile extends StatelessWidget {
  const SwappableTile({
    super.key,
    required this.identityKey,
    required this.onSwap,
    required this.child,
  });

  final String identityKey;
  final void Function(String fromKey, String toKey) onSwap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return DragTarget<String>(
          onWillAcceptWithDetails: (details) => details.data != identityKey,
          onAcceptWithDetails: (details) => onSwap(details.data, identityKey),
          builder: (context, candidates, _) {
            final target = candidates.isNotEmpty;

            return LongPressDraggable<String>(
              data: identityKey,
              onDragStarted: HapticFeedback.mediumImpact,
              feedback: Material(
                color: Colors.transparent,
                child: Transform.scale(
                  scale: 1.1,
                  child: SizedBox(
                    width: constraints.maxWidth,
                    height: constraints.maxHeight,
                    child: child,
                  ),
                ),
              ),
              childWhenDragging: Opacity(opacity: 0.3, child: child),
              child: DecoratedBox(
                position: DecorationPosition.foreground,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: target
                      ? Border.all(
                          color: Theme.of(context).colorScheme.primary,
                          width: 2,
                        )
                      : null,
                ),
                child: child,
              ),
            );
          },
        );
      },
    );
  }
}
