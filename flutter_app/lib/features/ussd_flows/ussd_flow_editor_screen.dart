import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class _StepDraft {
  final matchAllCtrl = TextEditingController();
  String action = 'send_digit';
  final actionValueCtrl = TextEditingController();

  _StepDraft();

  _StepDraft.fromMap(Map<String, dynamic> map) {
    matchAllCtrl.text = (map['match_all'] as List?)?.join(', ') ?? '';
    action = map['action'] ?? 'send_digit';
    actionValueCtrl.text = map['action_value'] ?? '';
  }

  bool get needsActionValue =>
      ['send_digit', 'send_literal', 'auto_confirm_once'].contains(action);

  Map<String, dynamic> toMap() => {
        'match_all': matchAllCtrl.text
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .where((s) => s.isNotEmpty)
            .toList(),
        'action': action,
        if (needsActionValue) 'action_value': actionValueCtrl.text.trim(),
      };

  void dispose() {
    matchAllCtrl.dispose();
    actionValueCtrl.dispose();
  }
}

// Business-owner-facing flow editor. Superuser-managed global flows are
// never edited here (see ussdFlowController.js - business owners get a
// 403 if they try) - this screen is only ever opened in create mode, or
// in edit mode for a flow the current company already owns.
class UssdFlowEditorScreen extends StatefulWidget {
  final Map<String, dynamic>? existingFlow; // null = create mode
  // Reused for Personal (Paid subscribers) too. Provider and transaction
  // choices are loaded from this mode's /capabilities endpoint instead
  // of being duplicated in Flutter.
  final String apiBasePath;
  const UssdFlowEditorScreen({
    super.key,
    this.existingFlow,
    this.apiBasePath = '/ussd-flows',
  });

  @override
  State<UssdFlowEditorScreen> createState() => _UssdFlowEditorScreenState();
}

class _UssdFlowEditorScreenState extends State<UssdFlowEditorScreen> {
  String _provider = '';
  String _transactionType = '';
  List<String> _providers = [];
  List<Map<String, String>> _transactionTypes = [];
  bool _loadingCapabilities = true;
  String? _capabilitiesError;

  final _dialCodeCtrl = TextEditingController();
  final _successMarkersCtrl = TextEditingController();
  final _failureMarkersCtrl = TextEditingController();
  final _bundleCategoryCtrl = TextEditingController();
  final _recipientModeCtrl = TextEditingController();
  final List<_StepDraft> _steps = [];
  bool _saving = false;

  final _actions = const [
    {'value': 'send_digit', 'label': 'Send Digit'},
    {'value': 'send_customer_phone', 'label': 'Send Customer Phone'},
    {'value': 'send_amount', 'label': 'Send Amount'},
    {'value': 'send_operator_id', 'label': 'Send Operator ID'},
    {'value': 'send_reference', 'label': 'Send Reference'},
    {'value': 'send_merchant_id', 'label': 'Send Merchant / Till ID'},
    {'value': 'send_selection', 'label': 'Send Dynamic Selection'},
    {'value': 'send_literal', 'label': 'Send Literal Text'},
    {'value': 'pin_prompt', 'label': 'PIN Prompt (stop here)'},
    {'value': 'auto_confirm_once', 'label': 'Auto-Confirm Once (post-PIN)'},
  ];

  bool get _isEditing => widget.existingFlow != null;

  @override
  void initState() {
    super.initState();

    if (widget.existingFlow != null) {
      final flow = widget.existingFlow!;
      _provider = flow['provider']?.toString() ?? '';
      _transactionType = flow['transaction_type']?.toString() ?? '';
      _dialCodeCtrl.text = flow['dial_code'] ?? '';
      _successMarkersCtrl.text =
          (flow['success_markers'] as List?)?.join(', ') ?? '';
      _failureMarkersCtrl.text =
          (flow['failure_markers'] as List?)?.join(', ') ?? '';
      _bundleCategoryCtrl.text = flow['bundle_category']?.toString() ?? '';
      _recipientModeCtrl.text = flow['recipient_mode']?.toString() ?? '';

      final existingSteps = (flow['steps'] as List?) ?? [];
      for (final s in existingSteps) {
        _steps.add(_StepDraft.fromMap(s as Map<String, dynamic>));
      }
    }

    if (_steps.isEmpty) _steps.add(_StepDraft());

    _loadCapabilities();
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

  String _transactionTypeLabel(String value) {
    for (final item in _transactionTypes) {
      if (item['value'] == value) {
        final label = item['label'];
        if (label != null && label.trim().isNotEmpty) return label;
      }
    }

    return _humanize(value);
  }

  Future<void> _loadCapabilities() async {
    if (mounted) {
      setState(() {
        _loadingCapabilities = true;
        _capabilitiesError = null;
      });
    }

    try {
      final response = await ApiClient.instance.get(
        '${widget.apiBasePath}/capabilities',
      );

      final rawData = response.data['data'];
      if (rawData is! Map) {
        throw const FormatException('Invalid capability response');
      }

      final rawProviders = rawData['providers'];
      final rawTransactionTypes = rawData['transaction_types'];

      if (rawProviders is! List || rawTransactionTypes is! List) {
        throw const FormatException('Invalid capability response');
      }

      final providers = rawProviders
          .map((value) => value?.toString().trim() ?? '')
          .where((value) => value.isNotEmpty)
          .toSet()
          .toList();

      final transactionTypes = <Map<String, String>>[];

      for (final raw in rawTransactionTypes) {
        if (raw is! Map) continue;

        final value = raw['value']?.toString().trim() ?? '';
        if (value.isEmpty) continue;

        final label = raw['label']?.toString().trim();

        transactionTypes.add({
          'value': value,
          'label': label == null || label.isEmpty ? _humanize(value) : label,
        });
      }

      // Editing an existing row must remain possible even if its capability
      // has subsequently been disabled. Provider/type are immutable in edit
      // mode, so retaining them here does not expose them for new creation.
      if (_isEditing) {
        if (_provider.isNotEmpty && !providers.contains(_provider)) {
          providers.add(_provider);
        }

        if (_transactionType.isNotEmpty &&
            !transactionTypes.any(
              (item) => item['value'] == _transactionType,
            )) {
          transactionTypes.add({
            'value': _transactionType,
            'label': _humanize(_transactionType),
          });
        }
      }

      if (providers.isEmpty || transactionTypes.isEmpty) {
        throw const FormatException(
          'No USSD Flow Builder capabilities are configured',
        );
      }

      if (!mounted) return;

      setState(() {
        _providers = providers;
        _transactionTypes = transactionTypes;

        if (_provider.isEmpty || !_providers.contains(_provider)) {
          _provider = _providers.first;
        }

        if (_transactionType.isEmpty ||
            !_transactionTypes.any(
              (item) => item['value'] == _transactionType,
            )) {
          _transactionType = _transactionTypes.first['value']!;
        }

        _loadingCapabilities = false;
        _capabilitiesError = null;
      });
    } catch (_) {
      if (!mounted) return;

      if (_isEditing && _provider.isNotEmpty && _transactionType.isNotEmpty) {
        setState(() {
          _providers = [_provider];
          _transactionTypes = [
            {'value': _transactionType, 'label': _humanize(_transactionType)},
          ];
          _loadingCapabilities = false;
          _capabilitiesError = 'Could not refresh Flow Builder capabilities. '
              'Existing provider and transaction type remain locked.';
        });
        return;
      }

      setState(() {
        _loadingCapabilities = false;
        _capabilitiesError =
            'Could not load Flow Builder capabilities. Please try again.';
      });
    }
  }

  void _addStep() => setState(() => _steps.add(_StepDraft()));

  void _removeStep(int index) {
    setState(() {
      _steps[index].dispose();
      _steps.removeAt(index);
    });
  }

  void _moveStep(int from, int to) {
    if (from < 0 ||
        from >= _steps.length ||
        to < 0 ||
        to >= _steps.length ||
        from == to) {
      return;
    }

    setState(() {
      final step = _steps.removeAt(from);
      _steps.insert(to, step);
    });
  }

  Future<void> _save() async {
    if (_provider.isEmpty || _transactionType.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Provider and transaction type are required'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
      return;
    }

    if (_dialCodeCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Dial code is required')));
      return;
    }
    if (_steps.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('At least one step is required')),
      );
      return;
    }

    final pinPromptIndex = _steps.indexWhere(
      (step) => step.action == 'pin_prompt',
    );

    final autoConfirmIndexes = <int>[];

    for (var i = 0; i < _steps.length; i++) {
      final step = _steps[i];

      if (step.action != 'auto_confirm_once') continue;

      autoConfirmIndexes.add(i);

      if (!RegExp(r'^[0-9]$').hasMatch(step.actionValueCtrl.text.trim())) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Step ${i + 1}: Auto-Confirm Once must be exactly one '
              'numeric menu digit.',
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );
        return;
      }
    }

    if (autoConfirmIndexes.length > 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Only one Auto-Confirm Once step is allowed per flow.'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
      return;
    }

    if (autoConfirmIndexes.isNotEmpty &&
        (pinPromptIndex < 0 || autoConfirmIndexes.first <= pinPromptIndex)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Step ${autoConfirmIndexes.first + 1}: Auto-Confirm Once '
            'must be placed after the PIN Prompt step.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
      return;
    }

    setState(() => _saving = true);
    final payload = {
      'provider': _provider,
      'transaction_type': _transactionType,
      'dial_code': _dialCodeCtrl.text.trim(),
      'success_markers': _successMarkersCtrl.text
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .where((s) => s.isNotEmpty)
          .toList(),
      'failure_markers': _failureMarkersCtrl.text
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .where((s) => s.isNotEmpty)
          .toList(),
      'bundle_category': _bundleCategoryCtrl.text.trim().isEmpty
          ? null
          : _bundleCategoryCtrl.text.trim(),
      'recipient_mode': _recipientModeCtrl.text.trim().isEmpty
          ? null
          : _recipientModeCtrl.text.trim(),
      'steps': _steps.map((s) => s.toMap()).toList(),
    };

    try {
      if (_isEditing) {
        await ApiClient.instance.patch(
          '${widget.apiBasePath}/${widget.existingFlow!['id']}',
          data: payload,
        );
      } else {
        await ApiClient.instance.post(widget.apiBasePath, data: payload);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_isEditing ? 'Flow updated' : 'Flow created')),
        );
        context.pop(true);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to save flow';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg.toString()),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingCapabilities) {
      return Scaffold(
        appBar: AppBar(title: Text(_isEditing ? 'Edit Flow' : 'New Flow')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (!_isEditing && _capabilitiesError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('New Flow')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_capabilitiesError!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _loadCapabilities,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Flow' : 'New Flow')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_capabilitiesError != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: context.appTileColor(const Color(0xFFFFF3CD)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _capabilitiesError!,
                style: TextStyle(fontSize: 11, color: context.appPrimaryText),
              ),
            ),
            const SizedBox(height: 12),
          ],
          Text(
            'PROVIDER',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _providers.map((p) {
              final selected = _provider == p;
              final color = AppTheme.providerColor(p);

              return GestureDetector(
                onTap: _isEditing ? null : () => setState(() => _provider = p),
                child: Container(
                  constraints: const BoxConstraints(minWidth: 92),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: selected ? color : context.appSurface,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(
                      color: selected ? color : context.appDivider,
                    ),
                  ),
                  child: Text(
                    _providerLabel(p),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: selected
                          ? (p == 'mtn' ? Colors.black : Colors.white)
                          : context.appSecondaryText,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Text(
            'TRANSACTION TYPE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _transactionType,
                isExpanded: true,
                items: _transactionTypes
                    .map(
                      (item) => DropdownMenuItem<String>(
                        value: item['value']!,
                        child: Text(_transactionTypeLabel(item['value']!)),
                      ),
                    )
                    .toList(),
                onChanged: _isEditing
                    ? null
                    : (v) {
                        if (v != null) {
                          setState(() => _transactionType = v);
                        }
                      },
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'FLOW VARIANT (OPTIONAL)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Use these only when the same provider and transaction type has different USSD paths.',
            style: TextStyle(fontSize: 9.5, color: context.appSecondaryText),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _bundleCategoryCtrl,
            decoration: const InputDecoration(
              labelText: 'Bundle category',
              hintText: 'e.g. flexi, fixed, mashup',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _recipientModeCtrl,
            decoration: const InputDecoration(
              labelText: 'Recipient mode',
              hintText: 'e.g. self, other, same_network',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'DIAL CODE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _dialCodeCtrl,
            style: const TextStyle(fontFamily: 'monospace'),
            decoration: const InputDecoration(
              hintText: '*100#',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'SUCCESS MARKERS (comma-separated)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _successMarkersCtrl,
            decoration: const InputDecoration(
              hintText: 'successful, approved',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'FAILURE MARKERS (comma-separated)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _failureMarkersCtrl,
            decoration: const InputDecoration(
              hintText: 'failed, insufficient, invalid',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'STEPS (in order)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 8),
          ..._steps.asMap().entries.map((entry) {
            final i = entry.key;
            final step = entry.value;
            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Step ${i + 1}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Move step up',
                          icon: const Icon(
                            Icons.keyboard_arrow_up,
                            size: 22,
                          ),
                          color: context.appSecondaryText,
                          disabledColor:
                              context.appSecondaryText.withValues(alpha: 0.3),
                          onPressed: i == 0 ? null : () => _moveStep(i, i - 1),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 34,
                            minHeight: 34,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Move step down',
                          icon: const Icon(
                            Icons.keyboard_arrow_down,
                            size: 22,
                          ),
                          color: context.appSecondaryText,
                          disabledColor:
                              context.appSecondaryText.withValues(alpha: 0.3),
                          onPressed: i == _steps.length - 1
                              ? null
                              : () => _moveStep(i, i + 1),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 34,
                            minHeight: 34,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Remove step',
                          icon: Icon(
                            Icons.close,
                            size: 18,
                            color: context.appSecondaryText,
                          ),
                          onPressed: () => _removeStep(i),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 34,
                            minHeight: 34,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Match if screen contains (comma-separated, ALL must match)',
                      style: TextStyle(
                        fontSize: 9.5,
                        color: context.appSecondaryText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: step.matchAllCtrl,
                      style: const TextStyle(fontSize: 12),
                      decoration: const InputDecoration(
                        isDense: true,
                        border: OutlineInputBorder(),
                        hintText: 'enter phone no',
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Action',
                      style: TextStyle(
                        fontSize: 9.5,
                        color: context.appSecondaryText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        border: Border.all(color: context.appDivider),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: step.action,
                          isExpanded: true,
                          style: TextStyle(
                            fontSize: 12,
                            color: context.appPrimaryText,
                          ),
                          items: _actions
                              .map(
                                (a) => DropdownMenuItem(
                                  value: a['value'],
                                  child: Text(a['label']!),
                                ),
                              )
                              .toList(),
                          onChanged: (v) => setState(() => step.action = v!),
                        ),
                      ),
                    ),
                    if (step.action == 'send_selection') ...[
                      const SizedBox(height: 6),
                      Text(
                        'The value is supplied dynamically by the transaction screen for this step.',
                        style: TextStyle(
                          fontSize: 9.5,
                          color: context.appSecondaryText,
                        ),
                      ),
                    ],
                    if (step.needsActionValue) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Value to send',
                        style: TextStyle(
                          fontSize: 9.5,
                          color: context.appSecondaryText,
                        ),
                      ),
                      const SizedBox(height: 4),
                      TextField(
                        controller: step.actionValueCtrl,
                        style: const TextStyle(fontSize: 12),
                        keyboardType: step.action == 'auto_confirm_once'
                            ? TextInputType.number
                            : TextInputType.text,
                        inputFormatters: step.action == 'auto_confirm_once'
                            ? [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(1),
                              ]
                            : null,
                        decoration: InputDecoration(
                          isDense: true,
                          border: const OutlineInputBorder(),
                          hintText: step.action == 'auto_confirm_once'
                              ? 'Single digit, e.g. 1'
                              : 'e.g. 1',
                          helperText: step.action == 'auto_confirm_once'
                              ? 'Must be after PIN Prompt. Only one is '
                                  'allowed, using one non-sensitive '
                                  'numeric menu choice.'
                              : null,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }),
          OutlinedButton.icon(
            onPressed: _addStep,
            icon: const Icon(Icons.add),
            label: const Text('Add Step'),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(_isEditing ? 'Save Changes' : 'Create Flow'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _dialCodeCtrl.dispose();
    _successMarkersCtrl.dispose();
    _failureMarkersCtrl.dispose();
    _bundleCategoryCtrl.dispose();
    _recipientModeCtrl.dispose();
    for (final s in _steps) {
      s.dispose();
    }
    super.dispose();
  }
}
