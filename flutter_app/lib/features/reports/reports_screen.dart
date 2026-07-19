// reports_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _period = 'month';
  String _format = 'pdf';
  bool _loading = false;
  bool _loadingBranches = true;
  List<dynamic> _branches = [];
  String? _branchId;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  Future<void> _loadBranches() async {
    // Only Owner/Manager have multiple branches to filter by - Agents
    // work a single branch and never see this dropdown at all.
    final role = (context.read<AuthBloc>().state as AuthAuthenticated).user['role'];
    if (role != 'business_owner' && role != 'manager') {
      setState(() => _loadingBranches = false);
      return;
    }
    try {
      final res = await ApiClient.instance.get('/branches');
      if (mounted) {
        setState(() {
          _branches = res.data['data'] ?? [];
          _loadingBranches = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingBranches = false);
    }
  }

  Future<void> _download(String type) async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get(
        '/reports/$type',
        queryParameters: {
          'period': _period,
          'format': _format,
          if (_branchId != null) 'branch_id': _branchId,
        },
        options: Options(responseType: ResponseType.bytes),
      );
      final dir = await getTemporaryDirectory();
      final ext = _format;
      final file = File('${dir.path}/${type}_${DateTime.now().millisecondsSinceEpoch}.$ext');
      await file.writeAsBytes(res.data);
      await OpenFile.open(file.path);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to generate report'), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Branch dropdown only ever has options for Owner/Manager - for
    // Agents (or if branches haven't loaded yet) it's simply omitted
    // rather than shown empty or disabled.
    final showBranchPicker = !_loadingBranches && _branches.isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: LoadingOverlay(
        isLoading: _loading,
        message: 'Generating report...',
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Period selector
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Period', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  for (final p in ['today', 'week', 'month', 'year'])
                    ChoiceChip(label: Text(p[0].toUpperCase() + p.substring(1)),
                      selected: _period == p, onSelected: (_) => setState(() => _period = p)),
                ]),
                const SizedBox(height: 12),
                const Text('Format', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  for (final f in ['pdf', 'excel', 'csv'])
                    ChoiceChip(label: Text(f.toUpperCase()),
                      selected: _format == f, onSelected: (_) => setState(() => _format = f)),
                ]),
                if (showBranchPicker) ...[
                  const SizedBox(height: 12),
                  const Text('Branch', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String?>(
                    value: _branchId,
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    hint: const Text('All Branches'),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('All Branches')),
                      for (final b in _branches)
                        DropdownMenuItem<String?>(value: b['id'] as String, child: Text(b['name'] ?? '')),
                    ],
                    onChanged: (v) => setState(() => _branchId = v),
                  ),
                ],
              ]),
            )),
            const SizedBox(height: 16),
            const SectionHeader(title: 'AVAILABLE REPORTS'),
            const SizedBox(height: 8),
            _ReportTile(
              icon: Icons.receipt_long_outlined, color: AppTheme.primaryColor,
              title: 'Transaction Report', subtitle: 'All transactions with status and amounts',
              onTap: () => _download('transactions'),
            ),
            _ReportTile(
              icon: Icons.payments_outlined, color: AppTheme.successColor,
              title: 'Commission Report', subtitle: 'Gross, provider share, and net commission',
              onTap: () => _download('commissions'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportTile extends StatelessWidget {
  final IconData icon; final Color color;
  final String title, subtitle; final VoidCallback onTap;
  const _ReportTile({required this.icon, required this.color, required this.title, required this.subtitle, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Card(child: ListTile(
      leading: CircleAvatar(backgroundColor: color.withOpacity(0.1), child: Icon(icon, color: color)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.download_outlined, color: AppTheme.primaryColor),
      onTap: onTap,
    ));
  }
}
