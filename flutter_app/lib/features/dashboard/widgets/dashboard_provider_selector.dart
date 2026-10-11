import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/services/sim_card_service.dart';
import '../../../shared/models/sim_role.dart';
import '../../../shared/theme/app_colors.dart';

String dashboardProviderLabel(String provider) {
  return switch (provider) {
    'mtn' => 'MTN',
    'telecel' => 'Telecel',
    'at_money' => 'AT Money',
    _ => provider,
  };
}

String? dashboardSimPurposeLabel(String? purpose) {
  return switch (purpose?.trim().toLowerCase()) {
    'agent' => 'AGENT',
    'subscriber' || 'personal' => 'SUBSCRIBER',
    'evd' => 'EVD',
    'merchant' => 'MERCHANT',
    _ => null,
  };
}

Color dashboardProviderColor(String provider) {
  return switch (provider) {
    'mtn' => const Color(0xFFFFCC00),
    'telecel' => const Color(0xFFE31837),
    'at_money' => const Color(0xFF003087),
    _ => Colors.grey,
  };
}

class DashboardProviderSelector extends StatelessWidget {
  const DashboardProviderSelector({
    super.key,
    required this.selectedProvider,
    required this.simMap,
    required this.simPurposes,
    required this.detectionComplete,
    required this.permissionDenied,
    required this.onProviderChanged,
    this.onPurposeSelected,
  });

  final String selectedProvider;
  final Map<String, SimCard?>? simMap;
  final Map<int, String> simPurposes;
  final bool detectionComplete;
  final bool permissionDenied;
  final ValueChanged<String> onProviderChanged;

  /// Called when a purpose is chosen from the hold-to-change menu. When null
  /// the menu is not offered.
  final Future<void> Function(SimCard sim, SimRole role)? onPurposeSelected;

  static String _roleTitle(SimRole role) => switch (role) {
        SimRole.agent => 'Agent',
        SimRole.subscriber => 'Subscriber',
        SimRole.evd => 'EVD',
        SimRole.merchant => 'Merchant',
      };

  static String _roleSubtitle(SimRole role) => switch (role) {
        SimRole.agent => 'Mobile Money Agent',
        SimRole.subscriber => 'Your normal transactions',
        SimRole.evd => 'Voucher distribution',
        SimRole.merchant => 'Collections and payments',
      };

  static IconData _roleIcon(SimRole role) => switch (role) {
        SimRole.agent => Icons.storefront_outlined,
        SimRole.subscriber => Icons.person_outline_rounded,
        SimRole.evd => Icons.confirmation_number_outlined,
        SimRole.merchant => Icons.point_of_sale_outlined,
      };

  Future<void> _showPurposeMenu(
    BuildContext tabContext,
    String provider,
    SimCard sim,
  ) async {
    final onSelected = onPurposeSelected;
    if (onSelected == null) return;

    final box = tabContext.findRenderObject();
    final overlay =
        Overlay.of(tabContext).context.findRenderObject();
    if (box is! RenderBox || overlay is! RenderBox) return;

    HapticFeedback.selectionClick();

    final origin = box.localToGlobal(
      Offset(0, box.size.height + 4),
      ancestor: overlay,
    );
    final position = RelativeRect.fromRect(
      Rect.fromLTWH(origin.dx, origin.dy, box.size.width, 0),
      Offset.zero & overlay.size,
    );

    final current = canonicalSimPurpose(simPurposes[sim.slot]);

    final chosen = await showMenu<SimRole>(
      context: tabContext,
      position: position,
      items: [
        PopupMenuItem<SimRole>(
          enabled: false,
          height: 36,
          child: Text(
            '${dashboardProviderLabel(provider)} · '
            'SIM ${sim.slot + 1} purpose',
            style: TextStyle(
              fontSize: 12,
              color: tabContext.appSecondaryText,
            ),
          ),
        ),
        for (final role in supportedSimRolesForProvider(provider))
          PopupMenuItem<SimRole>(
            value: role,
            child: Row(
              children: [
                Icon(_roleIcon(role), size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _roleTitle(role),
                        style: const TextStyle(fontSize: 14),
                      ),
                      Text(
                        _roleSubtitle(role),
                        style: TextStyle(
                          fontSize: 11,
                          color: tabContext.appSecondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
                if (current == _roleTitle(role).toLowerCase())
                  const Icon(Icons.check, size: 18),
              ],
            ),
          ),
      ],
    );

    if (chosen == null) return;

    await onSelected(sim, chosen);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 3,
          ),
        ],
      ),
      child: Row(
        children: _buildTabs(context),
      ),
    );
  }

  List<Widget> _buildTabs(BuildContext context) {
    if (!detectionComplete) {
      return const [
        Expanded(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 9),
                Text(
                  'Detecting SIMs…',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ];
    }

    final providers = simMap?.entries
            .where((entry) => entry.value != null)
            .map((entry) => entry.key)
            .toList() ??
        const <String>[];

    if (providers.isEmpty) {
      return [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 11,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  permissionDenied
                      ? Icons.sim_card_alert_outlined
                      : Icons.sim_card_outlined,
                  color: context.appSecondaryText,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    permissionDenied
                        ? 'Allow phone permission to detect SIMs'
                        : 'Insert a supported SIM',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ];
    }

    final widgets = <Widget>[];

    for (var i = 0; i < providers.length; i++) {
      final provider = providers[i];
      final sim = simMap?[provider];
      final purposeLabel = sim == null
          ? null
          : dashboardSimPurposeLabel(
              simPurposes[sim.slot],
            );

      widgets.add(
        Expanded(
          child: _DashboardProviderTab(
            label: sim == null
                ? dashboardProviderLabel(provider)
                : purposeLabel == null
                    ? '${dashboardProviderLabel(provider)}  '
                        'SIM ${sim.slot + 1}'
                    : '${dashboardProviderLabel(provider)} '
                        '($purposeLabel)',
            value: provider,
            selected: selectedProvider == provider,
            color: dashboardProviderColor(provider),
            onTap: onProviderChanged,
            onLongPress: sim == null || onPurposeSelected == null
                ? null
                : (tabContext) => _showPurposeMenu(
                      tabContext,
                      provider,
                      sim,
                    ),
          ),
        ),
      );

      if (i < providers.length - 1) {
        widgets.add(const SizedBox(width: 4));
      }
    }

    return widgets;
  }
}

class _DashboardProviderTab extends StatelessWidget {
  const _DashboardProviderTab({
    required this.label,
    required this.value,
    required this.selected,
    required this.color,
    required this.onTap,
    this.onLongPress,
  });

  final String label;
  final String value;
  final bool selected;
  final Color color;
  final ValueChanged<String> onTap;
  final void Function(BuildContext tabContext)? onLongPress;

  @override
  Widget build(BuildContext context) {
    final foreground = selected
        ? value == 'mtn'
            ? Colors.black
            : Colors.white
        : context.appSecondaryText;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: selected ? null : () => onTap(value),
        onLongPress:
            onLongPress == null ? null : () => onLongPress!(context),
        borderRadius: BorderRadius.circular(9),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(
            horizontal: 8,
            vertical: 9,
          ),
          decoration: BoxDecoration(
            color: selected ? color : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: foreground,
              fontSize: 11,
              fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
