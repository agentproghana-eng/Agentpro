import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

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
              foregroundColor: Colors.white,
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

  Future<void> _showTopUpSheet(BuildContext context) async {
    final completed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _TopUpSheet(initialBranchId: widget.branchId),
    );

    if (completed == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Branch float topped up successfully')),
      );

      await _load();
    }
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
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Business Float Balance',
              style: TextStyle(color: Colors.white, fontSize: 13),
            ),
            const SizedBox(height: 8),
            Text(
              'GH₵ ${total.toStringAsFixed(2)}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              branchScoped
                  ? 'Branch treasury · All providers'
                  : 'All active branches · All providers',
              style: const TextStyle(color: Colors.white, fontSize: 12),
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
                  ? 'Branch treasury balance. Separate from each agent\'s physical SIM wallet.'
                  : 'Business branch treasury balances. Separate from each agent\'s physical SIM wallet.',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: context.appSecondaryText,
                fontSize: 11.5,
                height: 1.3,
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
    final lowColor = Theme.of(context).colorScheme.error;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        children: [
          ListTile(
            dense: true,
            visualDensity: const VisualDensity(horizontal: -1, vertical: -2),
            contentPadding: const EdgeInsets.fromLTRB(14, 5, 14, 5),
            horizontalTitleGap: 10,
            leading: Tooltip(
              message: _providerLabel(provider),
              child: Container(
                width: 68,
                height: 38,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 7),
                decoration: BoxDecoration(
                  color: AppTheme.providerColor(
                    provider,
                  ).withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppTheme.providerColor(
                      provider,
                    ).withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  _providerShortLabel(provider),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.appPrimaryText,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            title: Text(
              account['branch_name']?.toString() ?? 'Branch',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              isLow
                  ? 'Low float · Threshold GH₵ ${threshold.toStringAsFixed(2)}'
                  : 'Threshold GH₵ ${threshold.toStringAsFixed(2)}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: isLow ? lowColor : context.appSecondaryText,
                fontSize: 11.5,
              ),
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                GhsAmount(
                  amount: balance,
                  fontSize: 16,
                  color: isLow ? lowColor : null,
                ),
                const SizedBox(height: 3),
                Tooltip(
                  message: _updatedLabel(account['last_updated_at']),
                  child: Icon(
                    Icons.info_outline_rounded,
                    size: 15,
                    color: context.appSecondaryText,
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

String _providerShortLabel(String provider) {
  return switch (provider) {
    'mtn' => 'MTN',
    'telecel' => 'Telecel',
    'at_money' => 'AT Money',
    _ => provider,
  };
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

  const _TopUpSheet({this.initialBranchId});

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

  String? _pendingClientOperationId;
  String? _pendingOperationFingerprint;

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

  bool _isRetryableError(DioException error) {
    final statusCode = error.response?.statusCode;

    // No response is ambiguous: the server may already have committed
    // the treasury movement before the response was lost.
    return error.response == null ||
        statusCode == 408 ||
        statusCode == 429 ||
        (statusCode != null && statusCode >= 500);
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

    // Treasury storage is DECIMAL(15, 2). Reject values that would
    // otherwise be silently rounded to another financial amount.
    final canonicalAmount = amount.toStringAsFixed(2);

    if ((amount - double.parse(canonicalAmount)).abs() > 0.000000001) {
      setState(() {
        _error = 'Enter an amount with no more than 2 decimal places.';
      });
      return;
    }

    final reference = _refCtrl.text.trim();

    final fingerprint = [
      _branchId!,
      _provider,
      canonicalAmount,
      reference,
    ].join('|');

    final canReuseOperation =
        _pendingClientOperationId != null &&
        _pendingOperationFingerprint == fingerprint;

    final clientOperationId = canReuseOperation
        ? _pendingClientOperationId!
        : const Uuid().v4();

    _pendingClientOperationId = clientOperationId;
    _pendingOperationFingerprint = fingerprint;

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
          'amount': canonicalAmount,
          'reference': reference,
          'client_operation_id': clientOperationId,
        },
      );

      // The backend definitively resolved this operation.
      // A future treasury top-up must receive a fresh UUID.
      _pendingClientOperationId = null;
      _pendingOperationFingerprint = null;

      if (!mounted) {
        return;
      }

      Navigator.pop(context, true);
    } on DioException catch (error) {
      final responseData = error.response?.data;

      final serverMessage = responseData is Map
          ? responseData['message']?.toString()
          : null;

      final retryable = _isRetryableError(error);

      if (!retryable) {
        // A definite rejection means there is no ambiguous operation
        // requiring the current UUID to survive another tap.
        _pendingClientOperationId = null;
        _pendingOperationFingerprint = null;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _error =
            serverMessage ??
            (retryable
                ? 'Connection problem while topping up branch float. Tap Top Up Branch Float again to safely retry the same operation.'
                : 'Failed to top up branch float.');
      });
    } catch (_) {
      // Preserve the UUID because an unexpected client failure may have
      // happened after the server committed the treasury operation.
      if (!mounted) {
        return;
      }

      setState(() {
        _error =
            'Branch float could not be confirmed. Tap Top Up Branch Float again to safely retry the same operation.';
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
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
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
