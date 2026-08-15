import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';

class CloseShiftScreen extends StatefulWidget {
  final String shiftId;

  const CloseShiftScreen({
    super.key,
    required this.shiftId,
  });

  @override
  State<CloseShiftScreen> createState() => _CloseShiftScreenState();
}

class _CloseShiftScreenState extends State<CloseShiftScreen> {
  final _cashController = TextEditingController();
  final _notesController = TextEditingController();

  bool _initialLoading = true;
  bool _submitting = false;
  String? _error;
  Map<String, dynamic>? _result;
  List<_ClosingSimDeclaration> _simDeclarations = const [];

  @override
  void initState() {
    super.initState();
    _loadCurrentShift();
  }

  @override
  void dispose() {
    _cashController.dispose();
    _notesController.dispose();

    for (final declaration in _simDeclarations) {
      declaration.dispose();
    }

    super.dispose();
  }

  double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  Future<void> _loadCurrentShift() async {
    if (mounted) {
      setState(() {
        _initialLoading = true;
        _error = null;
      });
    }

    try {
      final response = await ApiClient.instance.get('/shifts/current');

      final raw = response.data['data'];

      if (raw is Map == false) {
        throw const FormatException('Open shift not found');
      }

      final shift = Map<String, dynamic>.from(raw as Map);

      if ((shift['id']?.toString() == widget.shiftId) == false) {
        throw const FormatException('Open shift does not match');
      }

      final rawOpening = shift['opening_sim_balances'];
      final declarations = <_ClosingSimDeclaration>[];

      if (rawOpening is List) {
        for (final item in rawOpening) {
          if (item is Map) {
            declarations.add(
              _ClosingSimDeclaration.fromOpening(
                Map<String, dynamic>.from(item),
              ),
            );
          }
        }
      }

      if (mounted == false) {
        for (final declaration in declarations) {
          declaration.dispose();
        }
        return;
      }

      for (final declaration in _simDeclarations) {
        declaration.dispose();
      }

      setState(() {
        _simDeclarations = declarations;
        _initialLoading = false;
      });
    } catch (_) {
      if (mounted == false) return;

      setState(() {
        _error = 'Could not load the open shift reconciliation details.';
        _initialLoading = false;
      });
    }
  }

  double? _readAmount(TextEditingController controller) {
    final value = double.tryParse(controller.text.trim());

    if (value == null || value < 0) {
      return null;
    }

    return value;
  }

  Future<void> _submit() async {
    final cash = _readAmount(_cashController);

    if (cash == null) {
      setState(() {
        _error = 'Enter the physical Cash at Hand you counted.';
      });
      return;
    }

    final closingSimBalances = <Map<String, dynamic>>[];

    for (final declaration in _simDeclarations) {
      final data = <String, dynamic>{
        'sim_wallet_id': declaration.simWalletId,
      };

      if (declaration.requiresEFloat) {
        final amount = _readAmount(declaration.eFloatController);

        if (amount == null) {
          setState(() {
            _error =
                'Enter the closing e-Float balance for every captured SIM.';
          });
          return;
        }

        data['e_float_declared'] = amount;
      }

      if (declaration.requiresCommission) {
        final amount = _readAmount(declaration.commissionController);

        if (amount == null) {
          setState(() {
            _error =
                'Enter the closing Commission balance for every captured SIM.';
          });
          return;
        }

        data['commission_declared'] = amount;
      }

      if (declaration.requiresWorking) {
        final amount = _readAmount(declaration.workingController);

        if (amount == null) {
          setState(() {
            _error = 'Enter the closing Telecel Working Account balance.';
          });
          return;
        }

        data['working_declared'] = amount;
      }

      closingSimBalances.add(data);
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.post(
        '/shifts/${widget.shiftId}/close',
        data: {
          'closing_cash_declared': cash,
          'closing_sim_balances': closingSimBalances,
          'notes': _notesController.text.trim(),
        },
      );

      final raw = response.data['data'];

      if (raw is Map == false) {
        throw const FormatException('Invalid close shift response');
      }

      if (mounted == false) return;

      setState(() {
        _result = Map<String, dynamic>.from(raw as Map);
        _submitting = false;
      });
    } catch (_) {
      if (mounted == false) return;

      setState(() {
        _error =
            'Failed to close shift. Check every declaration and try again.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;

    if (result != null) {
      return _buildResult(context, result);
    }

    if (_initialLoading) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Close Shift'),
        ),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Close Shift'),
      ),
      body: RefreshIndicator(
        onRefresh: _loadCurrentShift,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Closing declaration',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Count what you actually have now. The electronic wallets below are the same exact wallets captured when this shift opened.',
              style: TextStyle(
                color: context.appSecondaryText,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 20),
            _SectionCard(
              title: 'Physical Cash',
              subtitle: 'Cash at Hand you counted now',
              child: TextField(
                controller: _cashController,
                enabled: _submitting == false,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Cash at Hand',
                  prefixText: 'GH₵ ',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            if (_simDeclarations.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(
                'Captured SIM wallets',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                'These wallet identities are frozen from the opening declaration. Enter their current balances.',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 10),
              for (final declaration in _simDeclarations) ...[
                _ClosingSimCard(
                  declaration: declaration,
                  enabled: _submitting == false,
                ),
                const SizedBox(height: 12),
              ],
            ],
            const SizedBox(height: 4),
            TextField(
              controller: _notesController,
              enabled: _submitting == false,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'Anything worth noting about this shift',
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error ?? '',
                style: const TextStyle(
                  color: AppTheme.errorColor,
                  fontSize: 12,
                ),
              ),
            ],
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('Close Shift'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResult(
    BuildContext context,
    Map<String, dynamic> result,
  ) {
    final variance = _number(result['variance']);
    final flagged = result['flagged'] == true;
    final expected = _number(result['closing_cash_expected']);
    final actual = _number(
      result['closing_cash_declared'] ?? result['closing_cash_actual'],
    );
    final transactionCount = result['transaction_count'] ?? 0;

    final color = flagged ? AppTheme.errorColor : AppTheme.primaryColor;

    final varianceLabel = variance == 0
        ? 'Exact match'
        : variance > 0
            ? 'GH₵ ${variance.toStringAsFixed(2)} surplus'
            : 'GH₵ ${(-variance).toStringAsFixed(2)} short';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shift Closed'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                Icon(
                  flagged ? Icons.warning_amber_rounded : Icons.check_circle,
                  color: color,
                  size: 48,
                ),
                const SizedBox(height: 12),
                Text(
                  varianceLabel,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: color,
                  ),
                ),
                if (flagged) ...[
                  const SizedBox(height: 4),
                  Text(
                    'This variance is large enough to be flagged for your manager or owner.',
                    style: TextStyle(
                      fontSize: 11,
                      color: context.appSecondaryText,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          _SummaryRow(
            label: 'Expected cash',
            value: 'GH₵ ${expected.toStringAsFixed(2)}',
          ),
          _SummaryRow(
            label: 'Actual cash counted',
            value: 'GH₵ ${actual.toStringAsFixed(2)}',
          ),
          _SummaryRow(
            label: 'Transactions this shift',
            value: '$transactionCount',
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => context.pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

class _ClosingSimDeclaration {
  final String simWalletId;
  final String provider;
  final int? simSlot;
  final bool requiresEFloat;
  final bool requiresCommission;
  final bool requiresWorking;

  final TextEditingController eFloatController = TextEditingController();
  final TextEditingController commissionController = TextEditingController();
  final TextEditingController workingController = TextEditingController();

  _ClosingSimDeclaration({
    required this.simWalletId,
    required this.provider,
    required this.simSlot,
    required this.requiresEFloat,
    required this.requiresCommission,
    required this.requiresWorking,
  });

  factory _ClosingSimDeclaration.fromOpening(
    Map<String, dynamic> opening,
  ) {
    final balanceTypes = <String>{};
    final balances = opening['balances'];

    if (balances is List) {
      for (final balance in balances) {
        if (balance is Map) {
          final type = balance['balance_type']?.toString();

          if (type != null && type.isNotEmpty) {
            balanceTypes.add(type);
          }
        }
      }
    }

    final slotValue = opening['sim_slot'];
    final slot = slotValue is int
        ? slotValue
        : int.tryParse(slotValue?.toString() ?? '');

    return _ClosingSimDeclaration(
      simWalletId: opening['sim_wallet_id']?.toString() ?? '',
      provider: opening['provider']?.toString() ?? '',
      simSlot: slot,
      requiresEFloat: balanceTypes.contains('e_float'),
      requiresCommission: balanceTypes.contains('commission'),
      requiresWorking: balanceTypes.contains('working_balance'),
    );
  }

  void dispose() {
    eFloatController.dispose();
    commissionController.dispose();
    workingController.dispose();
  }
}

class _ClosingSimCard extends StatelessWidget {
  final _ClosingSimDeclaration declaration;
  final bool enabled;

  const _ClosingSimCard({
    required this.declaration,
    required this.enabled,
  });

  String _providerLabel(String provider) {
    final normalized = provider.trim();

    if (normalized.isEmpty) return 'Mobile Money';

    return normalized
        .split('_')
        .where((part) => part.isNotEmpty)
        .map(
          (part) => '${part.substring(0, 1).toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final slot = declaration.simSlot;

    return _SectionCard(
      title: slot == null
          ? _providerLabel(declaration.provider)
          : 'SIM ${slot + 1} · ${_providerLabel(declaration.provider)}',
      subtitle: 'Opening-captured wallet',
      child: Column(
        children: [
          if (declaration.requiresEFloat) ...[
            TextField(
              controller: declaration.eFloatController,
              enabled: enabled,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'e-Float',
                prefixText: 'GH₵ ',
                border: OutlineInputBorder(),
              ),
            ),
          ],
          if (declaration.requiresCommission) ...[
            if (declaration.requiresEFloat) const SizedBox(height: 12),
            TextField(
              controller: declaration.commissionController,
              enabled: enabled,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Commission',
                prefixText: 'GH₵ ',
                border: OutlineInputBorder(),
              ),
            ),
          ],
          if (declaration.requiresWorking) ...[
            const SizedBox(height: 12),
            TextField(
              controller: declaration.workingController,
              enabled: enabled,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Working Account',
                prefixText: 'GH₵ ',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.appSecondaryText.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 13,
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
