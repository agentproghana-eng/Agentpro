import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class FloatScreen extends StatefulWidget {
  final String? branchId;

  const FloatScreen({super.key, this.branchId});

  @override
  State<FloatScreen> createState() => _FloatScreenState();
}

class _FloatScreenState extends State<FloatScreen> {
  List<dynamic> _accounts = [];
  double _total = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final res = await ApiClient.instance.get(
        '/float/overview',
        queryParameters: widget.branchId != null
            ? {'branch_id': widget.branchId}
            : null,
      );

      if (!mounted) {
        return;
      }

      final data = res.data['data'];

      setState(() {
        _accounts = data?['accounts'] ?? [];
        _total = double.tryParse(data?['grand_total']?.toString() ?? '0') ?? 0;
        _loading = false;
      });
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;
      final message = responseData is Map
          ? responseData['message']?.toString()
          : null;

      setState(() {
        _error = message ?? 'Failed to load business float balances';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Failed to load business float balances';
        _loading = false;
      });
    }
  }

  bool _canManageFloat(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;

    if (authState is! AuthAuthenticated) {
      return false;
    }

    final role = authState.user['role']?.toString();

    return role == 'business_owner' || role == 'manager' || role == 'superuser';
  }

  @override
  Widget build(BuildContext context) {
    final canManageFloat = _canManageFloat(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Float Balances'),
        actions: [
          IconButton(
            tooltip: 'Float History',
            onPressed: () {
              final branchId = widget.branchId;

              context.push(
                branchId == null
                    ? '/float/history'
                    : '/float/history?branch_id=$branchId',
              );
            },
            icon: const Icon(Icons.history),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? EmptyState(
              icon: Icons.error_outline,
              title: 'Could not load float balances',
              subtitle: _error,
              actionLabel: 'Retry',
              onAction: _load,
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  _TotalFloatCard(
                    total: _total,
                    branchScoped: widget.branchId != null,
                  ),
                  const SizedBox(height: 12),
                  _TreasuryExplanationCard(
                    branchScoped: widget.branchId != null,
                  ),
                  const SizedBox(height: 20),
                  const SectionHeader(title: 'BRANCH TREASURY BY PROVIDER'),
                  const SizedBox(height: 8),
                  if (_accounts.isEmpty)
                    const EmptyState(
                      icon: Icons.account_balance_wallet_outlined,
                      title: 'No branch float accounts yet',
                      subtitle:
                          'Business treasury float will appear here when available.',
                    )
                  else
                    ..._accounts.map((account) {
                      final accountMap = Map<String, dynamic>.from(
                        account as Map,
                      );

                      return _FloatCard(
                        account: accountMap,
                        canManage: canManageFloat,
                        onEditThreshold: canManageFloat
                            ? () => _showThresholdDialog(accountMap)
                            : null,
                      );
                    }),
                ],
              ),
            ),
      floatingActionButton: canManageFloat && !_loading && _error == null
          ? FloatingActionButton.extended(
              onPressed: () => _showTopUpSheet(context),
              icon: const Icon(Icons.add),
              label: const Text('Top Up Branch Float'),
              backgroundColor: AppTheme.primaryColor,
            )
          : null,
    );
  }

  Future<void> _showThresholdDialog(Map<String, dynamic> account) async {
    final branchId = account['branch_id']?.toString();

    final provider = account['provider']?.toString();

    if (branchId == null ||
        branchId.isEmpty ||
        provider == null ||
        provider.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This float account is missing branch or provider information.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
      return;
    }

    final currentThreshold =
        double.tryParse(account['low_balance_threshold']?.toString() ?? '0') ??
        0;

    final controller = TextEditingController(
      text: currentThreshold.toStringAsFixed(2),
    );

    String? validationError;

    final threshold = await showDialog<double>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            void save() {
              final value = double.tryParse(
                controller.text.replaceAll(',', '').trim(),
              );

              if (value == null || value < 0) {
                setDialogState(() {
                  validationError = 'Enter a valid amount of zero or greater.';
                });
                return;
              }

              Navigator.pop(dialogContext, value);
            }

            return AlertDialog(
              title: const Text('Low Float Threshold'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_providerLabel(provider)} · '
                    '${account['branch_name']?.toString() ?? 'Branch'}',
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Alert threshold',
                      prefixText: 'GH₵ ',
                      border: const OutlineInputBorder(),
                      errorText: validationError,
                    ),
                    onSubmitted: (_) => save(),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'The business is alerted when this branch provider balance is at or below this amount.',
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                  },
                  child: const Text('Cancel'),
                ),
                ElevatedButton(onPressed: save, child: const Text('Save')),
              ],
            );
          },
        );
      },
    );

    controller.dispose();

    if (threshold == null || !mounted) {
      return;
    }

    try {
      await ApiClient.instance.patch(
        '/float/threshold',
        data: {
          'branch_id': branchId,
          'provider': provider,
          'threshold': threshold,
        },
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Low-float threshold updated')),
      );

      await _load();
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;
      final message = responseData is Map
          ? responseData['message']?.toString()
          : null;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message ?? 'Failed to update threshold'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to update threshold'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _showTopUpSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) =>
          _TopUpSheet(initialBranchId: widget.branchId, onDone: _load),
    );
  }
}

class _TotalFloatCard extends StatelessWidget {
  final double total;
  final bool branchScoped;

  const _TotalFloatCard({required this.total, required this.branchScoped});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppTheme.primaryColor,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Business Float Balance',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 8),
            Text(
              'GH₵ ${total.toStringAsFixed(2)}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              branchScoped
                  ? 'Branch treasury · All providers'
                  : 'All active branches · All providers',
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _TreasuryExplanationCard extends StatelessWidget {
  final bool branchScoped;

  const _TreasuryExplanationCard({required this.branchScoped});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appTileColor(const Color(0xFFE6F4F1)),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.appDivider),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline,
            size: 19,
            color: context.isDarkMode
                ? AppTheme.primaryLight
                : AppTheme.primaryColor,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              branchScoped
                  ? 'This is the branch treasury float. It is separate from each agent\'s physical SIM wallet balance.'
                  : 'These are business branch treasury balances. They are separate from each agent\'s physical SIM wallet balance shown in My Balance.',
              style: TextStyle(
                color: context.appSecondaryText,
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatCard extends StatelessWidget {
  final Map<String, dynamic> account;
  final bool canManage;
  final VoidCallback? onEditThreshold;

  const _FloatCard({
    required this.account,
    required this.canManage,
    this.onEditThreshold,
  });

  @override
  Widget build(BuildContext context) {
    final balance =
        double.tryParse(account['current_balance']?.toString() ?? '0') ?? 0;

    final threshold =
        double.tryParse(account['low_balance_threshold']?.toString() ?? '0') ??
        0;

    final isLow = balance <= threshold;
    final provider = account['provider']?.toString() ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        children: [
          ListTile(
            contentPadding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            leading: CircleAvatar(
              backgroundColor: AppTheme.providerColor(
                provider,
              ).withValues(alpha: 0.15),
              child: ProviderBadge(provider: provider),
            ),
            title: Text(
              account['branch_name']?.toString() ?? 'Branch',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              isLow
                  ? 'Low float · Threshold GH₵ ${threshold.toStringAsFixed(2)}'
                  : 'Threshold GH₵ ${threshold.toStringAsFixed(2)}',
              style: TextStyle(
                color: isLow ? AppTheme.errorColor : context.appSecondaryText,
                fontSize: 12,
              ),
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                GhsAmount(
                  amount: balance,
                  fontSize: 16,
                  color: isLow ? AppTheme.errorColor : null,
                ),
                Text(
                  _updatedLabel(account['last_updated_at']),
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
          if (canManage && onEditThreshold != null) ...[
            Divider(height: 1, color: context.appDivider),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onEditThreshold,
                icon: const Icon(Icons.notifications_outlined, size: 17),
                label: const Text('Edit low-float threshold'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _updatedLabel(dynamic value) {
    if (value == null) {
      return 'Updated: —';
    }

    final parsed = DateTime.tryParse(value.toString());

    if (parsed == null) {
      return 'Updated: —';
    }

    final local = parsed.toLocal();

    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');

    return 'Updated: $month-$day $hour:$minute';
  }
}

String _providerLabel(String provider) {
  return switch (provider) {
    'mtn' => 'MTN Mobile Money',
    'telecel' => 'Telecel Cash',
    'at_money' => 'AT Money',
    _ => provider,
  };
}

class _TopUpSheet extends StatefulWidget {
  final String? initialBranchId;
  final VoidCallback onDone;

  const _TopUpSheet({required this.onDone, this.initialBranchId});

  @override
  State<_TopUpSheet> createState() => _TopUpSheetState();
}

class _TopUpSheetState extends State<_TopUpSheet> {
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();

  String _provider = 'mtn';
  String? _branchId;
  List<dynamic> _branches = [];

  bool _loadingBranches = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
    _loadBranches();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadBranches() async {
    try {
      final res = await ApiClient.instance.get('/branches');

      if (!mounted) {
        return;
      }

      final branches = List<dynamic>.from(res.data['data'] ?? const []);

      setState(() {
        _branches = branches;

        final requestedBranchExists =
            _branchId != null &&
            branches.any((branch) => branch['id']?.toString() == _branchId);

        if (!requestedBranchExists) {
          _branchId = branches.isNotEmpty
              ? branches.first['id']?.toString()
              : null;
        }

        _loadingBranches = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadingBranches = false;
        _error = 'Could not load available branches.';
      });
    }
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text.replaceAll(',', '').trim());

    if (_branchId == null) {
      setState(() {
        _error = 'Select a branch.';
      });
      return;
    }

    if (amount == null || amount <= 0) {
      setState(() {
        _error = 'Enter a valid amount greater than zero.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ApiClient.instance.post(
        '/float/top-up',
        data: {
          'branch_id': _branchId,
          'provider': _provider,
          'amount': amount,
          'reference': _refCtrl.text.trim(),
        },
      );

      if (!mounted) {
        return;
      }

      Navigator.pop(context);
      widget.onDone();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Branch float topped up successfully')),
      );
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;
      final message = responseData is Map
          ? responseData['message']?.toString()
          : null;

      setState(() {
        _error = message ?? 'Failed to top up branch float.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Failed to top up branch float.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Top Up Branch Float',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'This updates the selected branch treasury balance. It does not change any agent\'s SIM wallet.',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 16),
              if (_loadingBranches)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_branches.isEmpty)
                const Text('No accessible branches are available.')
              else
                DropdownButtonFormField<String>(
                  initialValue: _branchId,
                  decoration: const InputDecoration(
                    labelText: 'Branch',
                    border: OutlineInputBorder(),
                  ),
                  items: _branches
                      .map(
                        (branch) => DropdownMenuItem<String>(
                          value: branch['id']?.toString(),
                          child: Text(branch['name']?.toString() ?? 'Branch'),
                        ),
                      )
                      .toList(),
                  onChanged: _submitting
                      ? null
                      : (value) {
                          setState(() {
                            _branchId = value;
                            _error = null;
                          });
                        },
                ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _provider,
                decoration: const InputDecoration(
                  labelText: 'Provider',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'mtn',
                    child: Text('MTN Mobile Money'),
                  ),
                  DropdownMenuItem(
                    value: 'telecel',
                    child: Text('Telecel Cash'),
                  ),
                  DropdownMenuItem(value: 'at_money', child: Text('AT Money')),
                ],
                onChanged: _submitting
                    ? null
                    : (value) {
                        if (value == null) {
                          return;
                        }

                        setState(() {
                          _provider = value;
                          _error = null;
                        });
                      },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountCtrl,
                enabled: !_submitting,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  prefixText: 'GH₵ ',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _refCtrl,
                enabled: !_submitting,
                decoration: const InputDecoration(
                  labelText: 'Reference (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: AppTheme.errorColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              AppButton(
                label: 'Top Up Branch Float',
                onPressed: _loadingBranches || _branches.isEmpty
                    ? null
                    : _submit,
                isLoading: _submitting,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
