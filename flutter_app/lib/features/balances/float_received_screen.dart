import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import '../../core/services/transaction_device_preparation_service.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';

class FloatReceivedScreen extends StatefulWidget {
  final String initialProvider;
  final int? initialSimSlot;
  final String? initialSimIccid;
  final int? initialSimSubscriptionId;

  const FloatReceivedScreen({
    super.key,
    required this.initialProvider,
    this.initialSimSlot,
    this.initialSimIccid,
    this.initialSimSubscriptionId,
  });

  @override
  State<FloatReceivedScreen> createState() => _FloatReceivedScreenState();
}

class _FloatReceivedScreenState extends State<FloatReceivedScreen> {
  late String _provider;

  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();

  List<SimCard> _simCards = const [];
  int? _selectedSimSlot;
  bool _initialSimIdentityUnavailable = false;

  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  bool _loading = false;

  String? _error;

  // Retained only while the result of a financial POST is ambiguous.
  // Retrying the same provider/amount/reference/SIM must reuse the UUID
  // so Float Received can never be credited twice after a lost response.
  String? _pendingClientOperationId;
  String? _pendingOperationFingerprint;

  @override
  void initState() {
    super.initState();
    _provider = widget.initialProvider;
    _selectedSimSlot = widget.initialSimSlot;
    _loadSimCards();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    super.dispose();
  }

  List<String> get _availableProviders {
    if (!_simDetectionComplete) {
      return const <String>[];
    }

    final providers = _simCards
        .where((sim) => sim.isMoMoSupported)
        .map((sim) => sim.network)
        .toSet()
        .toList();

    const order = <String>[
      'mtn',
      'telecel',
      'at_money',
    ];

    providers.sort(
      (a, b) => order.indexOf(a).compareTo(order.indexOf(b)),
    );

    return providers;
  }

  List<SimCard> get _selectedProviderSims {
    final sims = _simCards.where((sim) => sim.network == _provider).toList();

    sims.sort((a, b) => a.slot.compareTo(b.slot));
    return sims;
  }

  SimCard? get _selectedSim {
    final sims = _selectedProviderSims;

    if (sims.isEmpty) {
      return null;
    }

    if (_selectedSimSlot != null) {
      for (final sim in sims) {
        if (sim.slot == _selectedSimSlot) {
          return sim;
        }
      }
    }

    if (_initialSimIdentityUnavailable) {
      return null;
    }

    return sims.first;
  }

  String _providerLabel(String provider) {
    return switch (provider) {
      'mtn' => 'MTN',
      'telecel' => 'Telecel',
      'at_money' => 'AT Money',
      _ => provider.toUpperCase(),
    };
  }

  String _simLabel(SimCard sim) {
    final iccid = sim.iccid.trim();

    if (iccid.isEmpty) {
      return 'SIM ${sim.slot + 1}';
    }

    final suffix =
        iccid.length <= 4 ? iccid : iccid.substring(iccid.length - 4);

    return 'SIM ${sim.slot + 1} · ••••$suffix';
  }

  Future<void> _loadSimCards() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
        _error = null;
      });
    }

    try {
      var sims = await SimCardService.getSimCards();

      // Android can briefly return an empty subscription list while the
      // telephony stack is still becoming ready after screen launch.
      if (sims.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) {
          return;
        }

        sims = await SimCardService.getSimCards();
      }

      if (!mounted) {
        return;
      }

      final supportedSims = sims.where((sim) => sim.isMoMoSupported).toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      final availableProviders =
          supportedSims.map((sim) => sim.network).toSet().toList();

      setState(() {
        _simCards = supportedSims;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        final requestedIccid =
            (widget.initialSimIccid ?? '').trim();

        final routeRequestedExactSim =
            widget.initialSimSlot != null ||
            requestedIccid.isNotEmpty ||
            widget.initialSimSubscriptionId != null;

        if (!routeRequestedExactSim &&
            availableProviders.isNotEmpty &&
            !availableProviders.contains(_provider)) {
          _provider = availableProviders.first;
        }

        final providerSims = supportedSims
            .where((sim) => sim.network == _provider)
            .toList()
          ..sort((a, b) => a.slot.compareTo(b.slot));

        SimCard? requestedSim;

        if (routeRequestedExactSim) {
          for (final sim in providerSims) {
            final slotMatches =
                widget.initialSimSlot == null ||
                sim.slot == widget.initialSimSlot;

            final identityMatches =
                requestedIccid.isNotEmpty
                    ? sim.iccid.trim() == requestedIccid &&
                        slotMatches
                    : slotMatches &&
                        widget.initialSimSubscriptionId != null &&
                        sim.subscriptionId ==
                            widget.initialSimSubscriptionId;

            if (identityMatches) {
              requestedSim = sim;
              break;
            }
          }
        }

        if (providerSims.isEmpty) {
          _selectedSimSlot = null;
          _initialSimIdentityUnavailable =
              routeRequestedExactSim;
        } else if (routeRequestedExactSim) {
          _selectedSimSlot = requestedSim?.slot;
          _initialSimIdentityUnavailable =
              requestedSim == null;
        } else if (!providerSims.any(
          (sim) => sim.slot == _selectedSimSlot,
        )) {
          _selectedSimSlot = providerSims.first.slot;
          _initialSimIdentityUnavailable = false;
        } else {
          _initialSimIdentityUnavailable = false;
        }
      });
    } on SimPermissionException {
      if (!mounted) {
        return;
      }

      setState(() {
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = false;
        _error = 'AgentPro could not detect the SIM cards on this device.';
      });
    }
  }

  void _selectProvider(String provider) {
    if (provider == _provider) {
      return;
    }

    final providerSims = _simCards
        .where((sim) => sim.network == provider)
        .toList()
      ..sort((a, b) => a.slot.compareTo(b.slot));

    setState(() {
      _provider = provider;
      _selectedSimSlot =
          providerSims.isEmpty ? null : providerSims.first.slot;
      _initialSimIdentityUnavailable = false;
      _error = null;
    });
  }

  bool _isRetryableError(DioException error) {
    final statusCode = error.response?.statusCode;

    // No response is ambiguous: the server may already have committed
    // the canonical transaction and wallet movement before the response
    // was lost. Reuse the same UUID in those cases.
    return error.response == null ||
        statusCode == 408 ||
        statusCode == 429 ||
        (statusCode != null && statusCode >= 500);
  }

  Future<void> _submit() async {
    final amount = double.tryParse(
      _amountCtrl.text.replaceAll(',', '').trim(),
    );

    if (amount == null || amount <= 0) {
      setState(() {
        _error = 'Enter a valid amount';
      });
      return;
    }

    if (!_simDetectionComplete) {
      setState(() {
        _error = 'SIM detection is still in progress.';
      });
      return;
    }

    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      setState(() {
        _error = _simPermissionDenied
            ? 'Allow phone permission before recording Float Received.'
            : 'Select the physical SIM that received this e-Float.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Re-check the exact SIM immediately before the financial POST.
      // A SIM may have been removed/replaced since initial screen detection.
      final devicePreparation =
          await TransactionDevicePreparationService.prepare(
        provider: _provider,
        requestedSimSlot: selectedSim.slot,
        requestedSimIccid: selectedSim.iccid,
        requestedSimSubscriptionId: selectedSim.subscriptionId,
      );

      if (!devicePreparation.isReady) {
        if (!mounted) {
          return;
        }

        setState(() {
          _error = devicePreparation.failureReason ??
              'AgentPro could not verify the selected SIM.';
        });
        return;
      }

      String installationId;

      try {
        installationId = await StorageService.getOrCreateInstallationId();
      } catch (_) {
        if (!mounted) {
          return;
        }

        setState(() {
          _error =
              'AgentPro could not establish this device identity. Please try again.';
        });
        return;
      }

      final verifiedSlot = devicePreparation.simSlot!;
      final verifiedIccid = (devicePreparation.simIccid ?? '').trim();
      final verifiedSubscriptionId = devicePreparation.simSubscriptionId;

      if (verifiedIccid.isEmpty && verifiedSubscriptionId == null) {
        if (!mounted) {
          return;
        }

        setState(() {
          _error =
              'AgentPro could not establish a safe identity for the selected SIM.';
        });
        return;
      }

      final externalReference = _refCtrl.text.trim();

      final simIdentity = verifiedIccid.isNotEmpty
          ? 'iccid:$verifiedIccid|slot:$verifiedSlot'
          : 'fallback:$installationId:${verifiedSubscriptionId!}:$verifiedSlot';

      final fingerprint = [
        _provider,
        amount.toStringAsFixed(2),
        externalReference,
        simIdentity,
      ].join('|');

      final canReuseOperation = _pendingClientOperationId != null &&
          _pendingOperationFingerprint == fingerprint;

      final clientOperationId =
          canReuseOperation ? _pendingClientOperationId! : const Uuid().v4();

      _pendingClientOperationId = clientOperationId;
      _pendingOperationFingerprint = fingerprint;

      await ApiClient.instance.post(
        '/balances/float-received',
        data: {
          'provider': _provider,
          'amount': amount,
          'reference': externalReference,
          'sim_iccid': verifiedIccid.isEmpty ? null : verifiedIccid,
          'sim_slot': verifiedSlot,
          'installation_id': installationId,
          'sim_subscription_id': verifiedSubscriptionId,
          'client_operation_id': clientOperationId,
        },
      );

      // The backend definitively resolved this operation. A future Float
      // Received declaration must receive a new financial operation ID.
      _pendingClientOperationId = null;
      _pendingOperationFingerprint = null;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Float received recorded successfully'),
          ),
        );

        context.pop();
      }
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final serverMessage =
          responseData is Map ? responseData['message']?.toString() : null;

      final retryable = _isRetryableError(error);

      if (!retryable) {
        // A definite rejection means there is no ambiguous operation
        // that needs to retain this client operation ID.
        _pendingClientOperationId = null;
        _pendingOperationFingerprint = null;
      }

      if (mounted) {
        setState(() {
          _error = serverMessage ??
              (retryable
                  ? 'Connection problem while recording Float Received. Tap Confirm Received again to safely retry the same operation.'
                  : 'Failed to record float received');
        });
      }
    } catch (_) {
      // Preserve the current operation UUID because the server may already
      // have committed the transaction before an unexpected client failure.
      if (mounted) {
        setState(() {
          _error =
              'Float Received could not be confirmed. Tap Confirm Received again to safely retry the same operation.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final providerSims = _selectedProviderSims;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Declare Float Received'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            if (!_simDetectionComplete) ...[
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    ),
                    SizedBox(width: 10),
                    Text(
                      'Detecting SIMs…',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (_availableProviders.isEmpty) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: context.appSurface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: context.appDivider,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.sim_card_alert_outlined,
                      color: context.appSecondaryText,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _simPermissionDenied
                            ? 'Allow phone permission to detect your SIM cards.'
                            : 'Insert an MTN, Telecel or AT Money SIM to continue.',
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ] else ...[
              const Text(
                'Provider',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (var i = 0; i < _availableProviders.length; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: _ProviderPill(
                        label: _providerLabel(
                          _availableProviders[i],
                        ),
                        value: _availableProviders[i],
                        selected: _provider == _availableProviders[i],
                        color: AppTheme.providerColor(
                          _availableProviders[i],
                        ),
                        onTap: _selectProvider,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'SIM Receiving Float',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 8),
              if (providerSims.length > 1 ||
                  (_initialSimIdentityUnavailable &&
                      providerSims.isNotEmpty))
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: providerSims.map((sim) {
                    return ChoiceChip(
                      label: Text(_simLabel(sim)),
                      selected: _selectedSimSlot == sim.slot,
                      onSelected: _loading
                          ? null
                          : (_) {
                              setState(() {
                                _selectedSimSlot = sim.slot;
                                _initialSimIdentityUnavailable = false;
                                _error = null;
                              });
                            },
                    );
                  }).toList(),
                )
              else if (providerSims.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: context.appSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: context.appDivider,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.sim_card_outlined,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _simLabel(providerSims.first),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
            ],
            const Text(
              'Amount Received',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _amountCtrl,
              enabled: !_loading,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                prefixText: 'GH₵ ',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Reference (optional)',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _refCtrl,
              enabled: !_loading,
              decoration: const InputDecoration(
                hintText: 'e.g. super-agent name or receipt no.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.appTileColor(
                  const Color(0xFFE6F4F1),
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'This adds directly to the selected SIM wallet\'s e-Float balance. '
                'No branch float is changed and no approval is required.',
                style: TextStyle(
                  fontSize: 11,
                  color: context.isDarkMode
                      ? AppTheme.primaryLight
                      : AppTheme.primaryColor,
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                  color: AppTheme.errorColor,
                ),
              ),
            ],
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed:
                  _loading || !_simDetectionComplete || _selectedSim == null
                      ? null
                      : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('Confirm Received'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProviderPill extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final Color color;
  final void Function(String) onTap;

  const _ProviderPill({
    required this.label,
    required this.value,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(
          vertical: 9,
        ),
        decoration: BoxDecoration(
          color: selected ? color : context.appSurface,
          borderRadius: BorderRadius.circular(9),
          border: selected
              ? null
              : Border.all(
                  color: context.appDivider,
                ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: selected
                ? (value == 'mtn' ? Colors.black : Colors.white)
                : context.appSecondaryText,
          ),
        ),
      ),
    );
  }
}
