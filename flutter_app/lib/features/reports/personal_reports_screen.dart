// personal_reports_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_file/open_file.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/theme/app_colors.dart';

/// Paid-Personal-only per spec (enforced server-side by
/// requirePaidPersonalPlan) - checks the same cached
/// personal_subscription_plan used elsewhere in the Personal UI and
/// shows an upgrade prompt instead of a filter form a Free user would
/// only get a 403 from anyway. Simpler than the Agent report screen:
/// no branch/agent/SIM/sort filters, since none of those concepts
/// exist on the Personal side, and only one report type (transactions).
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
  bool _loading = false;

  static const _periods = {
    'today': 'Today',
    'week': 'This Week',
    'month': 'This Month',
    'year': 'This Year'
  };
  static const _providers = {
    'all': 'All Providers',
    'mtn': 'MTN',
    'telecel': 'Telecel',
    'at_money': 'AT Money'
  };
  static const _types = {
    'all': 'All Types',
    'send_money_same_network': 'Send Money (Same Network)',
    'send_money_cross_network': 'Send Money (Other Network)',
    'buy_airtime': 'Buy Airtime',
    'buy_data': 'Buy Data',
    'buy_mashup': 'Mash Up',
    'check_momo_balance': 'Check MoMo Balance',
    'check_airtime_balance': 'Check Airtime Balance',
    'withdraw_cash': 'Withdraw Cash',
  };
  static const _statuses = {
    'all': 'All Statuses',
    'success': 'Success',
    'failed': 'Failed',
    'pending_confirmation': 'Pending'
  };

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated &&
        state.user['personal_subscription_plan'] == 'paid';
  }

  Future<void> _download() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get(
        '/personal-reports/transactions',
        queryParameters: {
          'period': _period,
          'format': _format,
          if (_providerFilter != 'all') 'provider': _providerFilter,
          if (_typeFilter != 'all') 'transaction_type': _typeFilter,
          if (_statusFilter != 'all') 'status': _statusFilter,
        },
        options: Options(responseType: ResponseType.bytes),
      );
      final dir = await getTemporaryDirectory();
      final file = File(
          '${dir.path}/my_transactions_${DateTime.now().millisecondsSinceEpoch}.$_format');
      await file.writeAsBytes(res.data);
      await OpenFile.open(file.path);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to generate report'),
            backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _dropdown(String label, String value, Map<String, String> options,
      void Function(String) onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<String>(
        initialValue: value,
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder()),
        items: options.entries
            .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
            .toList(),
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_isPaid) {
      return Scaffold(
        appBar: AppBar(title: const Text('My Reports')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.lock_outline,
                  size: 48, color: AppTheme.primaryColor),
              const SizedBox(height: 16),
              const Text('Reports are a Paid feature',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(
                  'Upgrade your Personal plan to download PDF and CSV transaction reports.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.appSecondaryText)),
              const SizedBox(height: 20),
              AppButton(
                  label: 'Upgrade to Paid',
                  onPressed: () => context.push('/personal-subscription')),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('My Reports')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: ListView(
          children: [
            _dropdown('Period', _period, _periods,
                (v) => setState(() => _period = v)),
            _dropdown('Provider', _providerFilter, _providers,
                (v) => setState(() => _providerFilter = v)),
            _dropdown('Transaction Type', _typeFilter, _types,
                (v) => setState(() => _typeFilter = v)),
            _dropdown('Status', _statusFilter, _statuses,
                (v) => setState(() => _statusFilter = v)),
            const SizedBox(height: 8),
            const Text('Format',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: ChoiceChip(
                label: const Text('PDF'),
                selected: _format == 'pdf',
                onSelected: (_) => setState(() => _format = 'pdf'),
              )),
              const SizedBox(width: 10),
              Expanded(
                  child: ChoiceChip(
                label: const Text('CSV'),
                selected: _format == 'csv',
                onSelected: (_) => setState(() => _format = 'csv'),
              )),
            ]),
            const SizedBox(height: 24),
            AppButton(
                label: 'Generate Report',
                icon: Icons.download,
                onPressed: _download,
                isLoading: _loading),
          ],
        ),
      ),
    );
  }
}
