import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/services/biometric_service.dart';
import '../../../shared/theme/app_colors.dart';
import '../../../shared/theme/app_theme.dart';

class DashboardOwnerGlance extends StatefulWidget {
  const DashboardOwnerGlance({super.key});

  @override
  State<DashboardOwnerGlance> createState() => _DashboardOwnerGlanceState();
}

class _DashboardOwnerGlanceState extends State<DashboardOwnerGlance>
    with WidgetsBindingObserver {
  static const _revealDuration = Duration(seconds: 45);

  final _currency = NumberFormat.currency(
    locale: 'en_GH',
    symbol: 'GH₵',
    decimalDigits: 2,
  );

  Timer? _hideTimer;

  bool _revealed = false;
  bool _authenticating = false;
  bool _loading = false;

  double? _volume;
  double? _commission;
  int? _transactionCount;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hideTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _hide();
    }
  }

  void _hide() {
    _hideTimer?.cancel();

    if (!mounted || !_revealed) return;

    setState(() => _revealed = false);
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(_revealDuration, _hide);
  }

  Future<void> _reveal() async {
    if (_authenticating) return;

    setState(() => _authenticating = true);

    try {
      final authenticated = await _authenticate();

      if (!authenticated || !mounted) return;

      setState(() => _revealed = true);
      _scheduleHide();

      await _loadMetrics();
    } finally {
      if (mounted) {
        setState(() => _authenticating = false);
      }
    }
  }

  Future<bool> _authenticate() async {
    final result = await BiometricService.authenticateToUnlock();

    if (!mounted) return false;

    switch (result) {
      case BiometricResult.success:
        return true;

      case BiometricResult.cancelled:
        return false;

      case BiometricResult.notAvailable:
      case BiometricResult.notEnrolled:
        _showAuthenticationMessage(
          'Set up a phone screen lock, fingerprint, or face unlock '
          'to reveal sensitive owner figures.',
        );
        return false;

      case BiometricResult.lockedOut:
        _showAuthenticationMessage(
          'Phone authentication is temporarily locked. '
          'Unlock your phone and try again.',
        );
        return false;

      case BiometricResult.permanentlyLockedOut:
        _showAuthenticationMessage(
          'Phone authentication is locked. Use your phone settings '
          'to restore fingerprint, face, PIN, pattern, or password access.',
        );
        return false;

      case BiometricResult.error:
        _showAuthenticationMessage(
          'Phone authentication could not be completed. Please try again.',
        );
        return false;
    }
  }

  void _showAuthenticationMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _loadMetrics() async {
    if (_loading) return;

    setState(() => _loading = true);

    try {
      final response = await ApiClient.instance.get('/reports/dashboard');
      final raw = response.data['data'];

      if (raw is! Map) return;

      final data = Map<String, dynamic>.from(raw);

      final volume = _findNumber(
        data,
        const [
          'today_volume',
          'today_transaction_volume',
          'total_volume_today',
          'transaction_volume',
          'total_volume',
        ],
      );

      final commission = _findNumber(
        data,
        const [
          'today_commission',
          'commission_today',
          'total_commission_today',
          'commission_earned',
          'total_commission',
        ],
      );

      final count = _findNumber(
        data,
        const [
          'today_transactions',
          'transaction_count_today',
          'today_transaction_count',
          'transaction_count',
          'total_transactions',
        ],
      );

      if (!mounted) return;

      setState(() {
        _volume = volume;
        _commission = commission;
        _transactionCount = count?.round();
      });
    } catch (_) {
      // The protected card remains usable even if metrics are unavailable.
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  double? _findNumber(
    Map<String, dynamic> source,
    List<String> candidateKeys,
  ) {
    for (final key in candidateKeys) {
      final value = source[key];
      final parsed = _asDouble(value);

      if (parsed != null) return parsed;
    }

    for (final value in source.values) {
      if (value is Map) {
        final parsed = _findNumber(
          Map<String, dynamic>.from(value),
          candidateKeys,
        );

        if (parsed != null) return parsed;
      }
    }

    return null;
  }

  double? _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }

  String _money(double? value) {
    if (value == null) return 'Unavailable';
    return _currency.format(value);
  }

  String _count(int? value) {
    return value?.toString() ?? 'Unavailable';
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.primaryColor.withValues(
              alpha: 0.14,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: _revealed ? _buildRevealedContent() : _buildLockedContent(),
      ),
    );
  }

  Widget _buildLockedContent() {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: _authenticating ? null : _reveal,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 2,
          vertical: 4,
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(
                  alpha: 0.1,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.lock_outline_rounded,
                color: AppTheme.primaryColor,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Today at a glance',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Owner figures are hidden',
                    style: TextStyle(
                      fontSize: 11,
                      color: context.appSecondaryText,
                    ),
                  ),
                ],
              ),
            ),
            if (_authenticating)
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                ),
              )
            else
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Reveal',
                    style: TextStyle(
                      color: AppTheme.primaryColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  SizedBox(width: 4),
                  Icon(
                    Icons.fingerprint_rounded,
                    color: AppTheme.primaryColor,
                    size: 21,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRevealedContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Today at a glance',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            TextButton.icon(
              onPressed: _hide,
              icon: const Icon(
                Icons.visibility_off_outlined,
                size: 17,
              ),
              label: const Text('Hide'),
            ),
          ],
        ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
              ),
            ),
          )
        else
          Row(
            children: [
              Expanded(
                child: _Metric(
                  label: 'Volume',
                  value: _money(_volume),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Metric(
                  label: 'Commission',
                  value: _money(_commission),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Metric(
                  label: 'Transactions',
                  value: _count(_transactionCount),
                ),
              ),
            ],
          ),
        const SizedBox(height: 8),
        Text(
          'Figures hide automatically after 45 seconds.',
          style: TextStyle(
            fontSize: 9.5,
            color: context.appSecondaryText,
          ),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final String value;

  const _Metric({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 65),
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.055),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
