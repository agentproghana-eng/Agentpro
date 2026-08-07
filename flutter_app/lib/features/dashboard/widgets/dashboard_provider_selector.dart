import 'package:flutter/material.dart';

import '../../../core/services/sim_card_service.dart';
import '../../../shared/theme/app_colors.dart';

String dashboardProviderLabel(String provider) {
  return switch (provider) {
    'mtn' => 'MTN',
    'telecel' => 'Telecel',
    'at_money' => 'AT Money',
    _ => provider,
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
    required this.detectionComplete,
    required this.permissionDenied,
    required this.onProviderChanged,
  });

  final String selectedProvider;
  final Map<String, SimCard?>? simMap;
  final bool detectionComplete;
  final bool permissionDenied;
  final ValueChanged<String> onProviderChanged;

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

      widgets.add(
        Expanded(
          child: _DashboardProviderTab(
            label: sim == null
                ? dashboardProviderLabel(provider)
                : '${dashboardProviderLabel(provider)}  '
                    'SIM ${sim.slot + 1}',
            value: provider,
            selected: selectedProvider == provider,
            color: dashboardProviderColor(provider),
            onTap: onProviderChanged,
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
  });

  final String label;
  final String value;
  final bool selected;
  final Color color;
  final ValueChanged<String> onTap;

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
