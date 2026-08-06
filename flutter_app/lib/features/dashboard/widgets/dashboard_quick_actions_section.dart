import 'package:flutter/material.dart';

import '../../../shared/widgets/dashboard_empty_state.dart';

class DashboardQuickActionsSection extends StatelessWidget {
  final String providerLabel;
  final List<Widget> quickActions;
  final VoidCallback onCustomize;

  const DashboardQuickActionsSection({
    super.key,
    required this.providerLabel,
    required this.quickActions,
    required this.onCustomize,
  });

  @override
  Widget build(BuildContext context) {
    if (quickActions.isEmpty) {
      return DashboardEmptyState(
        icon: Icons.grid_view_rounded,
        title: 'No quick actions available',
        message: 'No transaction actions are currently '
            'available for $providerLabel. '
            'You can choose different actions in Templates.',
        actionLabel: 'Customize Quick Actions',
        actionIcon: Icons.tune_rounded,
        onAction: onCustomize,
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 0.9,
        children: quickActions,
      ),
    );
  }
}
