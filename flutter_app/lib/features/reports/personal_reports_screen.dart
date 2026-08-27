// personal_reports_screen.dart
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class PersonalReportsScreen extends StatefulWidget {
  const PersonalReportsScreen({super.key});

  @override
  State<PersonalReportsScreen> createState() => _PersonalReportsScreenState();
}

class _PersonalReportsScreenState extends State<PersonalReportsScreen> {
  String _period = 'month';
  String _format = 'pdf';
  String _providerFilter = 'all';
  String _typeFilter = 'all';
  String _statusFilter = 'all';

  DateTimeRange? _customRange;

  bool _loading = false;
  bool _loadingSummary = false;
  int _summaryRequestId = 0;
  Map<String, dynamic>? _activitySummary;

  static const Map<String, String> _periods = {
    'today': 'Today',
    'week': 'This Week',
    'month': 'This Month',
    'year': 'This Year',
    'custom': 'Custom Range',
  };

  static const Map<String, String> _providers = {
    'all': 'All Providers',
    'mtn': 'MTN',
    'telecel': 'Telecel',
    'at_money': 'AT Money',
  };

  static const Map<String, String> _types = {
    'all': 'All Types',
    'send_money_same_network': 'Transfer Money · Same Network',
    'send_money_cross_network': 'Transfer Money · Other Network',
    'buy_airtime': 'Buy Airtime',
    'buy_data': 'Buy Data',
    'buy_mashup': 'Buy Data · MashUp',
    'check_momo_balance': 'Check MoMo Balance',
    'check_airtime_balance': 'Check Airtime Balance',
    'withdraw_cash': 'Withdraw Cash',
  };

  static const Map<String, String> _statuses = {
    'all': 'All Statuses',
    'success': 'Success',
    'failed': 'Failed',
    'pending_confirmation': 'Pending',
  };

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _isPaid) {
        _loadActivitySummary();
      }
    });
  }

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;

    return state is AuthAuthenticated &&
        state.user['personal_subscription_plan'] == 'paid';
  }

  String _labelFor(Map<String, String> options, String value) {
    return options[value] ?? value;
  }

  String _twoDigits(int value) {
    return value.toString().padLeft(2, '0');
  }

  String _dateLabel(DateTime date) {
    return '${_twoDigits(date.day)}/'
        '${_twoDigits(date.month)}/'
        '${date.year}';
  }

  String get _customRangeLabel {
    final range = _customRange;

    if (range == null) {
      return 'Choose dates';
    }

    return '${_dateLabel(range.start)} – '
        '${_dateLabel(range.end)}';
  }

  Map<String, dynamic> _reportParameters() {
    final params = <String, dynamic>{'format': _format};

    if (_providerFilter != 'all') {
      params['provider'] = _providerFilter;
    }

    if (_typeFilter != 'all') {
      params['transaction_type'] = _typeFilter;
    }

    if (_statusFilter != 'all') {
      params['status'] = _statusFilter;
    }

    if (_period == 'custom' && _customRange != null) {
      final start = DateTime.utc(
        _customRange!.start.year,
        _customRange!.start.month,
        _customRange!.start.day,
      );

      final end = DateTime.utc(
        _customRange!.end.year,
        _customRange!.end.month,
        _customRange!.end.day,
        23,
        59,
        59,
        999,
      );

      params['from_date'] = start.toIso8601String();

      params['to_date'] = end.toIso8601String();
    } else {
      params['period'] = _period;
    }

    return params;
  }

  Map<String, dynamic> _summaryParameters() {
    final params = _reportParameters();

    params.remove('format');

    return params;
  }

  int _summaryInt(String key) {
    final value = _activitySummary?[key];

    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(
          value?.toString() ?? '',
        ) ??
        0;
  }

  double get _summarySuccessRate {
    final value = _activitySummary?['success_rate'];

    if (value is num) {
      return value.toDouble();
    }

    return double.tryParse(
          value?.toString() ?? '',
        ) ??
        0;
  }

  Future<void> _loadActivitySummary() async {
    final requestId = ++_summaryRequestId;

    if (mounted) {
      setState(() => _loadingSummary = true);
    }

    try {
      final response = await ApiClient.instance.get(
        '/personal-reports/transactions/summary',
        queryParameters: _summaryParameters(),
      );

      if (!mounted || requestId != _summaryRequestId) {
        return;
      }

      final body = response.data;
      final rawData = body is Map ? body['data'] : null;

      final summary = rawData is Map
          ? Map<String, dynamic>.from(rawData)
          : <String, dynamic>{};

      setState(() {
        _activitySummary = summary;
        _loadingSummary = false;
      });
    } catch (_) {
      if (!mounted || requestId != _summaryRequestId) {
        return;
      }

      setState(() {
        _activitySummary = null;
        _loadingSummary = false;
      });
    }
  }

  String _reportOpenFailureMessage(ResultType type) {
    switch (type) {
      case ResultType.noAppToOpen:
        return 'Report generated, but no compatible app is installed '
            'to open it.';
      case ResultType.fileNotFound:
        return 'Report generated, but the saved file could not be found.';
      case ResultType.permissionDenied:
        return 'Report generated, but Android denied access to open it.';
      case ResultType.error:
        return 'Report generated, but it could not be opened.';
      case ResultType.done:
        return 'Report opened.';
    }
  }

  Future<void> _openGeneratedReport(File file) async {
    try {
      final result = await OpenFilex.open(file.path);

      if (result.type == ResultType.done || !mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_reportOpenFailureMessage(result.type)),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report generated, but it could not be opened.'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  Future<void> _download() async {
    if (_loading) {
      return;
    }

    if (_period == 'custom' && _customRange == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Choose a custom date range first'),
          backgroundColor: AppTheme.errorColor,
        ),
      );

      return;
    }

    setState(() => _loading = true);

    try {
      final response = await ApiClient.instance.get(
        '/personal-reports/transactions',
        queryParameters: _reportParameters(),
        options: Options(responseType: ResponseType.bytes),
      );

      final dir = await getTemporaryDirectory();

      final file = File(
        '${dir.path}/my_transactions_'
        '${DateTime.now().millisecondsSinceEpoch}'
        '.$_format',
      );

      await file.writeAsBytes(response.data);

      await _openGeneratedReport(file);
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to generate report'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();

    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 10),
      lastDate: now,
      initialDateRange: _customRange ??
          DateTimeRange(start: DateTime(now.year, now.month, 1), end: now),
      helpText: 'Select report date range',
      saveText: 'Apply',
      builder: (context, child) {
        final theme = Theme.of(context);

        return Theme(
          data: theme.copyWith(
            colorScheme: theme.colorScheme.copyWith(
              primary: AppTheme.primaryColor,
              secondary: AppTheme.secondaryColor,
            ),
          ),
          child: child!,
        );
      },
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _period = 'custom';
      _customRange = selected;
    });

    await _loadActivitySummary();
  }

  Future<String?> _showSelector({
    required String title,
    required Map<String, String> options,
    required String selectedValue,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext);

        return SafeArea(
          top: false,
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(sheetContext).size.height * 0.72,
            ),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 10),
                Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 8, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    itemCount: options.length,
                    itemBuilder: (context, index) {
                      final entry = options.entries.elementAt(index);

                      final selected = entry.key == selectedValue;

                      return ListTile(
                        minTileHeight: 54,
                        leading: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: selected
                                ? AppTheme.primaryColor.withValues(alpha: 0.12)
                                : theme.colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            selected ? Icons.check_rounded : Icons.tune_rounded,
                            size: 19,
                            color: selected
                                ? AppTheme.primaryColor
                                : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        title: Text(
                          entry.value,
                          style: TextStyle(
                            fontWeight:
                                selected ? FontWeight.w700 : FontWeight.w500,
                            color: selected
                                ? AppTheme.primaryColor
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                        trailing: selected
                            ? const Icon(
                                Icons.check_circle,
                                color: AppTheme.secondaryColor,
                              )
                            : null,
                        onTap: () => Navigator.pop(sheetContext, entry.key),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _selectPeriod() async {
    final selected = await _showSelector(
      title: 'Select Period',
      options: _periods,
      selectedValue: _period,
    );

    if (selected == null || !mounted) {
      return;
    }

    if (selected == 'custom') {
      await _pickCustomRange();
      return;
    }

    setState(() {
      _period = selected;
      _customRange = null;
    });

    await _loadActivitySummary();
  }

  Future<void> _selectProvider() async {
    final selected = await _showSelector(
      title: 'Select Provider',
      options: _providers,
      selectedValue: _providerFilter,
    );

    if (selected != null && mounted) {
      setState(() => _providerFilter = selected);
      await _loadActivitySummary();
    }
  }

  Future<void> _selectTransactionType() async {
    final selected = await _showSelector(
      title: 'Select Transaction Type',
      options: _types,
      selectedValue: _typeFilter,
    );

    if (selected != null && mounted) {
      setState(() => _typeFilter = selected);
      await _loadActivitySummary();
    }
  }

  Future<void> _selectStatus() async {
    final selected = await _showSelector(
      title: 'Select Status',
      options: _statuses,
      selectedValue: _statusFilter,
    );

    if (selected != null && mounted) {
      setState(() => _statusFilter = selected);
      await _loadActivitySummary();
    }
  }

  Widget _selectorTile({
    required String label,
    required String value,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: InkWell(
        onTap: _loading ? null : onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: theme.dividerColor.withValues(alpha: 0.65),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: AppTheme.primaryColor, size: 19),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: context.appSecondaryText,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      value,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.keyboard_arrow_down_rounded,
                color: context.appSecondaryText,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _customRangeTile() {
    if (_period != 'custom') {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        onTap: _loading ? null : _pickCustomRange,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppTheme.primaryColor.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.date_range_outlined,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _customRangeLabel,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              const Icon(
                Icons.edit_calendar_outlined,
                color: AppTheme.secondaryColor,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _summaryMetric(
    BuildContext context, {
    required String label,
    required int value,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 5,
          vertical: 9,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(
                fontSize: 18,
                height: 1,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                color: context.appSecondaryText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _activitySummaryCard(BuildContext context) {
    final summary = _activitySummary;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.16),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.insights_outlined,
                size: 18,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(width: 7),
              const Expanded(
                child: Text(
                  'Activity Summary',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (_loadingSummary)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (summary == null && _loadingSummary)
            Text(
              'Loading matching activity...',
              style: TextStyle(
                fontSize: 11,
                color: context.appSecondaryText,
              ),
            )
          else if (summary == null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Activity summary is temporarily unavailable.',
                    style: TextStyle(
                      fontSize: 11,
                      color: context.appSecondaryText,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _loadingSummary ? null : _loadActivitySummary,
                  child: const Text('Retry'),
                ),
              ],
            )
          else ...[
            Row(
              children: [
                _summaryMetric(
                  context,
                  label: 'Total',
                  value: _summaryInt('count'),
                  color: AppTheme.primaryColor,
                ),
                const SizedBox(width: 6),
                _summaryMetric(
                  context,
                  label: 'Successful',
                  value: _summaryInt('success_count'),
                  color: AppTheme.successColor,
                ),
                const SizedBox(width: 6),
                _summaryMetric(
                  context,
                  label: 'Failed',
                  value: _summaryInt('failed_count'),
                  color: AppTheme.errorColor,
                ),
                const SizedBox(width: 6),
                _summaryMetric(
                  context,
                  label: 'Pending',
                  value: _summaryInt('pending_count'),
                  color: AppTheme.secondaryColor,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  'Success rate',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: context.appSecondaryText,
                  ),
                ),
                const Spacer(),
                Text(
                  '${_summarySuccessRate.toStringAsFixed(1)}%',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            LinearProgressIndicator(
              value: (_summarySuccessRate / 100).clamp(0.0, 1.0).toDouble(),
              minHeight: 4,
              color: AppTheme.primaryColor,
              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(20),
            ),
          ],
        ],
      ),
    );
  }

  Widget _formatCard({
    required String value,
    required String label,
    required IconData icon,
  }) {
    final selected = _format == value;

    final theme = Theme.of(context);

    return Expanded(
      child: InkWell(
        onTap: _loading
            ? null
            : () {
                setState(() => _format = value);
              },
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 9),
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.primaryColor.withValues(alpha: 0.10)
                : context.appSurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              width: selected ? 1.5 : 1,
              color: selected
                  ? AppTheme.primaryColor
                  : theme.dividerColor.withValues(alpha: 0.65),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color:
                    selected ? AppTheme.primaryColor : context.appSecondaryText,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: selected
                      ? AppTheme.primaryColor
                      : theme.colorScheme.onSurface,
                ),
              ),
              if (selected) ...[
                const SizedBox(width: 6),
                const Icon(
                  Icons.check_circle,
                  size: 16,
                  color: AppTheme.secondaryColor,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _paidScreen() {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('My Reports')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: AppTheme.primaryColor.withValues(alpha: 0.18),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.description_outlined,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Personal Reports',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Filter your activity and export a clean transaction report.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(
                  Icons.tune_rounded,
                  size: 18,
                  color: AppTheme.primaryColor,
                ),
                const SizedBox(width: 7),
                Text(
                  'Report Filters',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _selectorTile(
              label: 'Period',
              value: _labelFor(_periods, _period),
              icon: Icons.calendar_month_outlined,
              onTap: _selectPeriod,
            ),
            _customRangeTile(),
            _selectorTile(
              label: 'Provider',
              value: _labelFor(_providers, _providerFilter),
              icon: Icons.sim_card_outlined,
              onTap: _selectProvider,
            ),
            _selectorTile(
              label: 'Transaction Type',
              value: _labelFor(_types, _typeFilter),
              icon: Icons.receipt_long_outlined,
              onTap: _selectTransactionType,
            ),
            _selectorTile(
              label: 'Status',
              value: _labelFor(_statuses, _statusFilter),
              icon: Icons.task_alt_outlined,
              onTap: _selectStatus,
            ),
            _activitySummaryCard(context),
            const SizedBox(height: 14),
            Text(
              'Export Format',
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _formatCard(
                  value: 'pdf',
                  label: 'PDF',
                  icon: Icons.picture_as_pdf_outlined,
                ),
                const SizedBox(width: 10),
                _formatCard(
                  value: 'csv',
                  label: 'CSV',
                  icon: Icons.table_view_outlined,
                ),
              ],
            ),
            const SizedBox(height: 18),
            AppButton(
              label: _loading ? 'Generating Report' : 'Generate Report',
              icon: Icons.download_rounded,
              onPressed: _download,
              isLoading: _loading,
            ),
            const SizedBox(height: 10),
            Text(
              'The report opens automatically when generation finishes.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: context.appSecondaryText),
            ),
          ],
        ),
      ),
    );
  }

  Widget _upgradeScreen() {
    return Scaffold(
      appBar: AppBar(title: const Text('My Reports')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.lock_outline,
                size: 48,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(height: 16),
              const Text(
                'Reports are a Paid feature',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'Upgrade your Personal plan to download PDF and CSV transaction reports.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.appSecondaryText),
              ),
              const SizedBox(height: 20),
              AppButton(
                label: 'Upgrade to Paid',
                onPressed: () => context.push('/personal-subscription'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_isPaid) {
      return _upgradeScreen();
    }

    return _paidScreen();
  }
}
