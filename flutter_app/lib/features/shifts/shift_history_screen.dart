// shift_history_screen.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

/// Owner/Manager-facing review of closed shifts, surfacing the
/// variance between expected and physically-counted cash at close.
/// Consumes GET /shifts, which already existed on the backend
/// (pagination, agent_id/branch_id/flagged_only filters, a computed
/// flagged boolean based on system_config's threshold) with no
/// frontend screen calling it until now.
class ShiftHistoryScreen extends StatefulWidget {
  const ShiftHistoryScreen({super.key});
  @override
  State<ShiftHistoryScreen> createState() => _ShiftHistoryScreenState();
}

class _ShiftHistoryScreenState extends State<ShiftHistoryScreen> {
  List<dynamic> _shifts = [];
  bool _flaggedOnly = false;
  bool _loading = true;
  bool _loadingMore = false;
  int _page = 1;
  int _totalPages = 1;
  double _threshold = 20.00;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool loadMore = false}) async {
    setState(() => loadMore ? _loadingMore = true : _loading = true);
    try {
      final nextPage = loadMore ? _page + 1 : 1;
      final res = await ApiClient.instance.get('/shifts', queryParameters: {
        'page': nextPage,
        'limit': 20,
        if (_flaggedOnly) 'flagged_only': 'true',
      });
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          _shifts = loadMore ? [..._shifts, ...data] : data;
          _page = nextPage;
          _totalPages = meta?['total_pages'] ?? 1;
          _threshold = double.tryParse(meta?['threshold']?.toString() ?? '') ?? 20.00;
          _loading = false;
          _loadingMore = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _loadingMore = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Shift Reconciliation')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(child: Text(
              'Threshold for flagging: GH₵${_threshold.toStringAsFixed(2)}',
              style: TextStyle(fontSize: 11, color: context.appSecondaryText),
            )),
            FilterChip(
              label: const Text('Flagged only'),
              selected: _flaggedOnly,
              onSelected: (v) { setState(() => _flaggedOnly = v); _load(); },
              selectedColor: AppTheme.errorColor.withOpacity(0.15),
              checkmarkColor: AppTheme.errorColor,
            ),
          ]),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _shifts.isEmpty
                  ? Center(child: Text(_flaggedOnly ? 'No flagged shifts' : 'No closed shifts yet'))
                  : RefreshIndicator(
                      onRefresh: () => _load(),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        itemCount: _shifts.length + (_page < _totalPages ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i == _shifts.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: _loadingMore
                                    ? const CircularProgressIndicator()
                                    : TextButton(onPressed: () => _load(loadMore: true), child: const Text('Load More')),
                              ),
                            );
                          }
                          return _ShiftCard(shift: _shifts[i] as Map<String, dynamic>);
                        },
                      ),
                    ),
        ),
      ]),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  final Map<String, dynamic> shift;
  const _ShiftCard({required this.shift});

  @override
  Widget build(BuildContext context) {
    final variance = double.tryParse(shift['variance']?.toString() ?? '') ?? 0;
    final flagged = shift['flagged'] == true;
    final name = '${shift['first_name'] ?? ''} ${shift['last_name'] ?? ''}'.trim();
    final branch = shift['branch_name'] ?? 'No branch';
    DateTime? closedAt;
    try { closedAt = DateTime.parse(shift['closed_at'].toString()); } catch (_) {}
    final closedStr = closedAt != null ? DateFormat('MMM d, HH:mm').format(closedAt.toLocal()) : '';
    final color = flagged ? AppTheme.errorColor : AppTheme.primaryColor;
    final varianceLabel = variance == 0
        ? 'Exact match'
        : variance > 0
            ? 'GH₵${variance.toStringAsFixed(2)} surplus'
            : 'GH₵${(-variance).toStringAsFixed(2)} short';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(flagged ? Icons.warning_amber_rounded : Icons.check_circle_outline, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name.isEmpty ? 'Unknown agent' : name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            Text('$branch \u00b7 $closedStr \u00b7 ${shift['transaction_count'] ?? 0} txns',
              style: TextStyle(fontSize: 10.5, color: context.appSecondaryText)),
          ])),
          Text(varianceLabel, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: color)),
        ]),
      ),
    );
  }
}
