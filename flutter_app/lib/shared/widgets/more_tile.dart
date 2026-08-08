// more_tile.dart
import 'package:flutter/material.dart';
import '../../core/services/storage_service.dart';
import '../theme/app_theme.dart';
import '../theme/app_colors.dart';

/// Section header for a More/Settings-style grouped list.
class MoreGroupLabel extends StatelessWidget {
  final String label;
  const MoreGroupLabel(this.label, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Text(label.toUpperCase(),
            style: TextStyle(
                fontSize: 11,
                color: context.appSecondaryText,
                fontWeight: FontWeight.bold,
                letterSpacing: 1)),
      );
}

/// Shared More-tab list tile, consolidating what used to be three
/// near-identical private copies duplicated across Agent/Owner/
/// Manager (plus giving Personal the same treatment for the first
/// time). newFeatureKey, if provided, shows a "NEW" badge only the
/// first time this specific tile is ever rendered on this device -
/// once seen it's marked seen in StorageService and never shows
/// again, rather than the old hardcoded isNew: true that never
/// turned off no matter how long a feature had existed.
class MoreTile extends StatefulWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final String? subtitle;
  final String? newFeatureKey;

  const MoreTile(
    this.icon,
    this.label,
    this.onTap, {
    super.key,
    this.color,
    this.subtitle,
    this.newFeatureKey,
  });

  @override
  State<MoreTile> createState() => _MoreTileState();
}

class _MoreTileState extends State<MoreTile> {
  bool _showNew = false;

  @override
  void initState() {
    super.initState();
    _checkNew();
  }

  Future<void> _checkNew() async {
    final key = widget.newFeatureKey;
    if (key == null) return;
    final seen = await StorageService.hasSeenFeature(key);
    if (!seen) {
      if (mounted) setState(() => _showNew = true);
      await StorageService.markFeatureSeen(key);
    }
  }

  @override
  Widget build(BuildContext context) => ListTile(
        leading:
            Icon(widget.icon, color: widget.color ?? AppTheme.primaryColor),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.label, style: TextStyle(color: widget.color)),
            if (_showNew)
              Container(
                margin: const EdgeInsets.only(left: 6),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                    color: AppTheme.secondaryColor,
                    borderRadius: BorderRadius.circular(6)),
                child: const Text('NEW',
                    style: TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.bold,
                        color: Colors.black)),
              ),
          ],
        ),
        subtitle: widget.subtitle == null
            ? null
            : Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  widget.subtitle!,
                  style: TextStyle(
                    fontSize: 11,
                    color: context.appSecondaryText,
                  ),
                ),
              ),
        trailing: Icon(
          Icons.chevron_right,
          color: context.appSecondaryText,
        ),
        onTap: widget.onTap,
      );
}
