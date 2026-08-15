import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/services/app_cache_service.dart';
import '../../../shared/theme/app_colors.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/dashboard_skeleton.dart';

class DashboardShiftCard extends StatefulWidget {
  const DashboardShiftCard({super.key});

  @override
  State<DashboardShiftCard> createState() => _DashboardShiftCardState();
}

class _DashboardShiftCardState extends State<DashboardShiftCard> {
  static const _cacheKey = 'dashboard_current_shift';

  Map<String, dynamic>? _currentShift;
  bool _loading = true;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentShift();
  }

  Future<void> _loadCurrentShift() async {
    final cached = AppCacheService.get(_cacheKey);

    if (cached is Map && mounted) {
      setState(() {
        _currentShift = Map<String, dynamic>.from(cached);
        _loading = false;
      });
    }

    try {
      final response = await ApiClient.instance.get('/shifts/current');
      final rawShift = response.data['data'];

      final shift =
          rawShift is Map ? Map<String, dynamic>.from(rawShift) : null;

      if (shift != null) {
        AppCacheService.set(_cacheKey, shift);
      } else {
        AppCacheService.remove(_cacheKey);
      }

      if (!mounted) return;

      setState(() {
        _currentShift = shift;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() => _loading = false);
    }
  }

  Future<void> _openShift() async {
    if (_opening) return;

    setState(() => _opening = true);

    try {
      await context.push('/shifts/open');

      if (mounted == false) return;

      await _loadCurrentShift();
    } finally {
      if (mounted) {
        setState(() => _opening = false);
      }
    }
  }

  Future<void> _closeShift(String shiftId) async {
    await context.push('/shifts/close/$shiftId');

    if (!mounted) return;

    await _loadCurrentShift();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const ShiftCardSkeleton();
    }

    final shift = _currentShift;
    final isOpen = shift != null;

    final openedAt =
        isOpen ? DateTime.tryParse(shift['opened_at']?.toString() ?? '') : null;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 15,
      ),
      decoration: BoxDecoration(
        color: isOpen
            ? context.appTileColor(const Color(0xFFDDF3EE))
            : context.appSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isOpen
              ? AppTheme.primaryColor.withValues(alpha: 0.18)
              : context.appSecondaryText.withValues(alpha: 0.10),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.055),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isOpen
                  ? AppTheme.primaryColor.withValues(alpha: 0.12)
                  : context.appSecondaryText.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isOpen ? Icons.timer_outlined : Icons.timer_off_outlined,
              color: isOpen ? AppTheme.primaryColor : context.appSecondaryText,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              isOpen
                  ? 'Shift open since '
                      '${openedAt != null ? DateFormat('h:mm a').format(openedAt.toLocal()) : '—'}'
                  : 'No active shift',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color:
                    isOpen ? AppTheme.primaryColor : context.appSecondaryText,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: _opening
                ? null
                : isOpen
                    ? () => _closeShift(shift['id'].toString())
                    : _openShift,
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  isOpen ? AppTheme.errorColor : AppTheme.primaryColor,
              minimumSize: const Size(0, 38),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              elevation: 1,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: _opening
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    isOpen ? 'Close Shift' : 'Open Shift',
                    style: const TextStyle(fontSize: 12),
                  ),
          ),
        ],
      ),
    );
  }
}
