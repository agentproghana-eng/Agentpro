import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import 'ussd_flow_editor_screen.dart';

// Lists Custom USSD flows for either Business or Personal mode.
//
// Business:
// - Global flows are centrally managed and read-only here.
// - The current company's own flows can be edited/deactivated/reactivated.
//
// Personal:
// - Every returned row belongs to the authenticated Personal user.
// - Flows can be edited/deactivated/reactivated.
class UssdFlowListScreen extends StatefulWidget {
  final bool isPersonal;

  const UssdFlowListScreen({
    super.key,
    this.isPersonal = false,
  });

  @override
  State<UssdFlowListScreen> createState() => _UssdFlowListScreenState();
}

class _UssdFlowListScreenState extends State<UssdFlowListScreen> {
  List<dynamic> _flows = [];
  bool _loading = true;
  String? _error;
  final Set<String> _changingFlowIds = <String>{};

  String get _basePath =>
      widget.isPersonal ? '/personal-ussd-flows' : '/ussd-flows';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await ApiClient.instance.get(_basePath);

      if (!mounted) return;

      final raw = res.data['data'];

      setState(() {
        _flows = raw is List ? raw : [];
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load Custom USSD flows';
        _loading = false;
      });
    }
  }

  String _humanize(String value) {
    if (value.trim().isEmpty) return value;

    return value
        .split('_')
        .where((part) => part.isNotEmpty)
        .map(
          (part) => part.length == 1
              ? part.toUpperCase()
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }

  String _providerLabel(String provider) => switch (provider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => _humanize(provider),
      };

  bool _isGlobal(Map<String, dynamic> flow) =>
      !widget.isPersonal &&
      flow['company_id'] == null &&
      flow['owner_user_id'] == null;

  bool _isActive(Map<String, dynamic> flow) => flow['is_active'] != false;

  String _scopeLabel(Map<String, dynamic> flow) {
    if (_isGlobal(flow)) return 'GLOBAL';
    if (widget.isPersonal) return 'MY FLOW';
    return 'MY COMPANY';
  }

  String _scopeDescription(Map<String, dynamic> flow) {
    if (_isGlobal(flow)) return 'Managed centrally';
    if (widget.isPersonal) return 'Personal flow';
    return 'Your company';
  }

  Future<void> _openFlow(Map<String, dynamic> flow) async {
    if (_isGlobal(flow)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Global flows are managed centrally and are read-only here.',
          ),
        ),
      );
      return;
    }

    try {
      final response = await ApiClient.instance.get('$_basePath/${flow['id']}');

      if (!mounted) return;

      final raw = response.data['data'];
      if (raw is! Map) {
        throw StateError('Invalid flow response');
      }

      final fullFlow = Map<String, dynamic>.from(raw);

      final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => UssdFlowEditorScreen(
            existingFlow: fullFlow,
            apiBasePath: _basePath,
          ),
        ),
      );

      if (result == true && mounted) {
        await _load();
      }
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to load the complete USSD flow'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  Future<void> _createFlow() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => UssdFlowEditorScreen(
          apiBasePath: _basePath,
        ),
      ),
    );

    if (result == true && mounted) {
      await _load();
    }
  }

  Future<bool> _confirmDeactivate(Map<String, dynamic> flow) async {
    final provider = _providerLabel(flow['provider']?.toString() ?? '');
    final transactionType =
        _humanize(flow['transaction_type']?.toString() ?? '');

    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Deactivate flow?'),
            content: Text(
              '$provider · $transactionType will stop being used for '
              'automatic USSD navigation. You can reactivate it later.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Deactivate'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _deactivateFlow(Map<String, dynamic> flow) async {
    if (_isGlobal(flow)) return;

    final id = flow['id']?.toString() ?? '';
    if (id.isEmpty || _changingFlowIds.contains(id)) return;

    final confirmed = await _confirmDeactivate(flow);
    if (!confirmed || !mounted) return;

    setState(() => _changingFlowIds.add(id));

    try {
      await ApiClient.instance.delete('$_basePath/$id');

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Flow deactivated')),
      );

      await _load();
    } on DioException catch (e) {
      if (!mounted) return;

      final message = e.response?.data?['message']?.toString() ??
          'Failed to deactivate flow';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _changingFlowIds.remove(id));
      }
    }
  }

  Future<void> _reactivateFlow(Map<String, dynamic> flow) async {
    if (_isGlobal(flow)) return;

    final id = flow['id']?.toString() ?? '';
    if (id.isEmpty || _changingFlowIds.contains(id)) return;

    setState(() => _changingFlowIds.add(id));

    try {
      await ApiClient.instance.patch(
        '$_basePath/$id',
        data: const {
          'is_active': true,
        },
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Flow reactivated')),
      );

      await _load();
    } on DioException catch (e) {
      if (!mounted) return;

      final message = e.response?.data?['message']?.toString() ??
          'Failed to reactivate flow';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _changingFlowIds.remove(id));
      }
    }
  }

  Widget _statusBadge(
    BuildContext context, {
    required bool isActive,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 7,
        vertical: 3,
      ),
      decoration: BoxDecoration(
        color: isActive
            ? context.appTileColor(const Color(0xFFE6F4F1))
            : context.appTileColor(const Color(0xFFF1F1F1)),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: isActive
              ? AppTheme.primaryColor.withValues(alpha: 0.35)
              : context.appDivider,
        ),
      ),
      child: Text(
        isActive ? 'ACTIVE' : 'INACTIVE',
        style: TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w800,
          color: isActive
              ? (context.isDarkMode
                  ? AppTheme.primaryLight
                  : AppTheme.primaryColor)
              : context.appSecondaryText,
        ),
      ),
    );
  }

  Widget _buildTrailing(
    BuildContext context,
    Map<String, dynamic> flow,
  ) {
    final isGlobal = _isGlobal(flow);
    final isActive = _isActive(flow);
    final id = flow['id']?.toString() ?? '';
    final changing = _changingFlowIds.contains(id);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _statusBadge(
          context,
          isActive: isActive,
        ),
        const SizedBox(width: 2),
        if (isGlobal)
          Padding(
            padding: const EdgeInsets.only(left: 6),
            child: Icon(
              Icons.lock_outline,
              size: 18,
              color: context.appSecondaryText,
            ),
          )
        else if (changing)
          const Padding(
            padding: EdgeInsets.all(10),
            child: SizedBox(
              width: 17,
              height: 17,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        else
          PopupMenuButton<String>(
            tooltip: 'Flow actions',
            onSelected: (value) {
              if (value == 'deactivate') {
                _deactivateFlow(flow);
              } else if (value == 'reactivate') {
                _reactivateFlow(flow);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem<String>(
                value: isActive ? 'deactivate' : 'reactivate',
                child: Row(
                  children: [
                    Icon(
                      isActive
                          ? Icons.pause_circle_outline
                          : Icons.play_circle_outline,
                      size: 19,
                    ),
                    const SizedBox(width: 8),
                    Text(isActive ? 'Deactivate' : 'Reactivate'),
                  ],
                ),
              ),
            ],
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Custom USSD Flows'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _load,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _flows.isEmpty
                  ? const Center(
                      child: Text(
                        'No Custom USSD flows yet.\nTap + to create one.',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _flows.length,
                        itemBuilder: (_, i) {
                          final flow =
                              Map<String, dynamic>.from(_flows[i] as Map);
                          final isActive = _isActive(flow);

                          final provider = _providerLabel(
                              flow['provider']?.toString() ?? '');
                          final transactionType = _humanize(
                            flow['transaction_type']?.toString() ?? '',
                          );

                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              title: Text(
                                '$provider · $transactionType',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                  color: isActive
                                      ? context.appPrimaryText
                                      : context.appSecondaryText,
                                ),
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  '${flow['dial_code'] ?? ''} · '
                                  '${_scopeDescription(flow)} · '
                                  '${_scopeLabel(flow)}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: context.appSecondaryText,
                                  ),
                                ),
                              ),
                              trailing: _buildTrailing(context, flow),
                              onTap: () => _openFlow(flow),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createFlow,
        backgroundColor: AppTheme.secondaryColor,
        child: const Icon(
          Icons.add,
          color: Colors.black,
        ),
      ),
    );
  }
}
