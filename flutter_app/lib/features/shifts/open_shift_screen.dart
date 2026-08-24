import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/sim_role_assignment_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';

class OpenShiftScreen extends StatefulWidget {
  const OpenShiftScreen({super.key});

  @override
  State<OpenShiftScreen> createState() => _OpenShiftScreenState();
}

class _OpenShiftScreenState extends State<OpenShiftScreen> {
  final _cashController = TextEditingController();

  List<_OpeningSimDeclaration> _simDeclarations = const [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _warning;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cashController.dispose();

    for (final declaration in _simDeclarations) {
      declaration.dispose();
    }

    super.dispose();
  }

  String _amount(dynamic value) {
    final parsed = double.tryParse(value?.toString() ?? '0') ?? 0;
    return parsed.toStringAsFixed(2);
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        _warning = null;
      });
    }

    try {
      var cards = await SimCardService.getSimCards();

      if (cards.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));
        cards = await SimCardService.getSimCards();
      }

      final businessCards = <SimCard>[];

      for (final card in cards) {
        if (card.isMoMoSupported == false) {
          continue;
        }

        final purpose = await SimRoleAssignmentService.roleForSlot(
          card.slot,
          refreshFromServer: true,
          simIccid: card.iccid,
          simSubscriptionId: card.subscriptionId,
          provider: card.network,
        );

        // Opening-shift balance semantics currently belong to
        // Agent SIM wallets only. EVD and Merchant are not silently
        // treated as Agent until their own balance semantics exist.
        if (purpose == 'agent') {
          businessCards.add(card);
        }
      }

      businessCards.sort(
        (a, b) => a.slot.compareTo(b.slot),
      );

      String? installationId;

      if (businessCards.any((card) => card.iccid.trim().isEmpty)) {
        installationId = await StorageService.getOrCreateInstallationId();
      }

      final declarations = <_OpeningSimDeclaration>[];
      var balanceReadFailed = false;

      for (final card in businessCards) {
        final queryParameters = <String, dynamic>{
          'provider': card.network,
          'sim_slot': card.slot,
        };

        final iccid = card.iccid.trim();

        if (iccid.isEmpty) {
          queryParameters['installation_id'] = installationId;
          queryParameters['sim_subscription_id'] = card.subscriptionId;
        } else {
          queryParameters['sim_iccid'] = iccid;
        }

        String? expectedEFloat;
        String? expectedCommission;
        String? expectedWorking;

        try {
          final response = await ApiClient.instance.get(
            '/balances/sim-wallet',
            queryParameters: queryParameters,
          );

          final rawData = response.data['data'];

          if (rawData is Map) {
            final data = Map<String, dynamic>.from(rawData);
            expectedEFloat = _amount(data['e_float_balance']);
            expectedCommission = _amount(data['commission_balance']);
            expectedWorking = _amount(data['working_balance']);
          }
        } catch (_) {
          balanceReadFailed = true;
        }

        declarations.add(
          _OpeningSimDeclaration(
            sim: card,
            installationId: installationId,
            expectedEFloat: expectedEFloat,
            expectedCommission: expectedCommission,
            expectedWorking: expectedWorking,
          ),
        );
      }

      if (mounted == false) {
        for (final declaration in declarations) {
          declaration.dispose();
        }
        return;
      }

      setState(() {
        _simDeclarations = declarations;
        _warning = balanceReadFailed
            ? 'Some expected electronic balances could not be loaded. Enter the balances shown on the agent SIM menus.'
            : null;
        _loading = false;
      });
    } on SimPermissionException {
      if (mounted == false) return;

      setState(() {
        _error =
            'Phone permission is required to identify the Business SIM wallets before opening a shift.';
        _loading = false;
      });
    } catch (_) {
      if (mounted == false) return;

      setState(() {
        _error = 'Could not prepare the opening shift declaration.';
        _loading = false;
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

    final simBalances = <Map<String, dynamic>>[];

    for (final declaration in _simDeclarations) {
      final eFloat = _readAmount(declaration.eFloatController);
      final commission = _readAmount(declaration.commissionController);

      if (eFloat == null || commission == null) {
        setState(() {
          _error =
              'Enter valid e-Float and Commission balances for every Business SIM.';
        });
        return;
      }

      double? working;

      if (declaration.requiresWorking) {
        working = _readAmount(declaration.workingController);

        if (working == null) {
          setState(() {
            _error = 'Enter the Telecel Working Account balance.';
          });
          return;
        }
      }

      final sim = declaration.sim;
      final iccid = sim.iccid.trim();

      simBalances.add({
        'provider': sim.network,
        'sim_iccid': iccid.isEmpty ? null : iccid,
        'installation_id': iccid.isEmpty ? declaration.installationId : null,
        'sim_subscription_id': sim.subscriptionId,
        'sim_slot': sim.slot,
        'e_float_declared': eFloat,
        'commission_declared': commission,
        if (working != null) 'working_declared': working,
      });
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ApiClient.instance.post('/shifts/open', data: {
        'opening_cash_declared': cash,
        'opening_sim_balances': simBalances,
      });

      if (mounted == false) return;

      context.pop(true);
    } catch (error) {
      if (mounted == false) return;

      setState(() {
        _error = 'Failed to open shift. Check the declarations and try again.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Open Shift'),
        ),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Open Shift'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Opening declaration',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Count the money you actually have before starting the shift. AgentPro stores the declaration separately from its expected ledger balances.',
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
                'Business SIM balances',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                'Enter the balances shown on each physical agent SIM. SIMs are kept separate even when two SIMs use the same provider.',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 10),
              for (final declaration in _simDeclarations) ...[
                _OpeningSimCard(
                  declaration: declaration,
                  enabled: _submitting == false,
                ),
                const SizedBox(height: 12),
              ],
            ],
            if (_simDeclarations.isEmpty && _error == null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: context.appSurface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: context.appSecondaryText.withValues(alpha: 0.12),
                  ),
                ),
                child: Text(
                  'No Business Mobile Money SIM is currently assigned on this device. This shift will reconcile physical cash only.',
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
            if (_warning != null) ...[
              const SizedBox(height: 12),
              Text(
                _warning ?? '',
                style: const TextStyle(
                  color: AppTheme.warningColor,
                  fontSize: 12,
                ),
              ),
            ],
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
              onPressed:
                  _submitting || _error != null && _loading ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('Open Shift'),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpeningSimDeclaration {
  final SimCard sim;
  final String? installationId;
  final String? expectedEFloat;
  final String? expectedCommission;
  final String? expectedWorking;

  final TextEditingController eFloatController = TextEditingController();
  final TextEditingController commissionController = TextEditingController();
  final TextEditingController workingController = TextEditingController();

  _OpeningSimDeclaration({
    required this.sim,
    required this.installationId,
    required this.expectedEFloat,
    required this.expectedCommission,
    required this.expectedWorking,
  });

  bool get requiresWorking => sim.network == 'telecel';

  void dispose() {
    eFloatController.dispose();
    commissionController.dispose();
    workingController.dispose();
  }
}

class _OpeningSimCard extends StatelessWidget {
  final _OpeningSimDeclaration declaration;
  final bool enabled;

  const _OpeningSimCard({
    required this.declaration,
    required this.enabled,
  });

  String _expected(String? value) {
    return value == null
        ? 'Expected balance unavailable'
        : 'Expected GH₵ $value';
  }

  @override
  Widget build(BuildContext context) {
    final sim = declaration.sim;

    return _SectionCard(
      title: 'SIM ${sim.slot + 1} · ${sim.displayName}',
      subtitle: 'Physical Business SIM',
      child: Column(
        children: [
          TextField(
            controller: declaration.eFloatController,
            enabled: enabled,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'e-Float',
              helperText: _expected(declaration.expectedEFloat),
              prefixText: 'GH₵ ',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: declaration.commissionController,
            enabled: enabled,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Commission',
              helperText: _expected(declaration.expectedCommission),
              prefixText: 'GH₵ ',
              border: const OutlineInputBorder(),
            ),
          ),
          if (declaration.requiresWorking) ...[
            const SizedBox(height: 12),
            TextField(
              controller: declaration.workingController,
              enabled: enabled,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Working Account',
                helperText: _expected(declaration.expectedWorking),
                prefixText: 'GH₵ ',
                border: const OutlineInputBorder(),
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
