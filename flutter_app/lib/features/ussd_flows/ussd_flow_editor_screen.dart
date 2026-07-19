import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

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

  bool get needsActionValue => ['send_digit', 'send_literal', 'auto_confirm_once'].contains(action);

  Map<String, dynamic> toMap() => {
    'match_all': matchAllCtrl.text.split(',').map((s) => s.trim().toLowerCase()).where((s) => s.isNotEmpty).toList(),
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
  const UssdFlowEditorScreen({super.key, this.existingFlow});

  @override
  State<UssdFlowEditorScreen> createState() => _UssdFlowEditorScreenState();
}

class _UssdFlowEditorScreenState extends State<UssdFlowEditorScreen> {
  String _provider = 'mtn';
  String _transactionType = 'cash_in';
  final _dialCodeCtrl = TextEditingController();
  final _successMarkersCtrl = TextEditingController();
  final _failureMarkersCtrl = TextEditingController();
  final List<_StepDraft> _steps = [];
  bool _saving = false;

  final _types = ['cash_in', 'cash_out', 'send_money', 'airtime', 'data_bundle', 'balance_enquiry', 'commission'];
  final _actions = const [
    {'value': 'send_digit', 'label': 'Send Digit'},
    {'value': 'send_customer_phone', 'label': 'Send Customer Phone'},
    {'value': 'send_amount', 'label': 'Send Amount'},
    {'value': 'send_operator_id', 'label': 'Send Operator ID'},
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
      _provider = flow['provider'] ?? 'mtn';
      _transactionType = flow['transaction_type'] ?? 'cash_in';
      _dialCodeCtrl.text = flow['dial_code'] ?? '';
      _successMarkersCtrl.text = (flow['success_markers'] as List?)?.join(', ') ?? '';
      _failureMarkersCtrl.text = (flow['failure_markers'] as List?)?.join(', ') ?? '';
      final existingSteps = (flow['steps'] as List?) ?? [];
      for (final s in existingSteps) {
        _steps.add(_StepDraft.fromMap(s as Map<String, dynamic>));
      }
    }
    if (_steps.isEmpty) _steps.add(_StepDraft());
  }

  void _addStep() => setState(() => _steps.add(_StepDraft()));

  void _removeStep(int index) {
    setState(() {
      _steps[index].dispose();
      _steps.removeAt(index);
    });
  }

  Future<void> _save() async {
    if (_dialCodeCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dial code is required')));
      return;
    }
    if (_steps.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('At least one step is required')));
      return;
    }

    setState(() => _saving = true);
    final payload = {
      'provider': _provider,
      'transaction_type': _transactionType,
      'dial_code': _dialCodeCtrl.text.trim(),
      'success_markers': _successMarkersCtrl.text.split(',').map((s) => s.trim().toLowerCase()).where((s) => s.isNotEmpty).toList(),
      'failure_markers': _failureMarkersCtrl.text.split(',').map((s) => s.trim().toLowerCase()).where((s) => s.isNotEmpty).toList(),
      'steps': _steps.map((s) => s.toMap()).toList(),
    };

    try {
      if (_isEditing) {
        await ApiClient.instance.patch('/ussd-flows/${widget.existingFlow!['id']}', data: payload);
      } else {
        await ApiClient.instance.post('/ussd-flows', data: payload);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_isEditing ? 'Flow updated' : 'Flow created')));
        context.pop(true);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to save flow';
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg.toString()), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Flow' : 'New Flow')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('PROVIDER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 8),
          Row(children: ['mtn', 'telecel', 'at_money'].map((p) {
            final selected = _provider == p;
            return Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _provider = p),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: selected ? AppTheme.primaryColor : Colors.white,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    {'mtn': 'MTN', 'telecel': 'Telecel', 'at_money': 'AT Money'}[p]!,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: selected ? Colors.white : Colors.grey),
                  ),
                ),
              ),
            );
          }).toList()),

          const SizedBox(height: 16),
          const Text('TRANSACTION TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _transactionType,
                isExpanded: true,
                items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t.replaceAll('_', ' ')))).toList(),
                onChanged: (v) => setState(() => _transactionType = v!),
              ),
            ),
          ),

          const SizedBox(height: 16),
          const Text('DIAL CODE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 8),
          TextField(
            controller: _dialCodeCtrl,
            style: const TextStyle(fontFamily: 'monospace'),
            decoration: const InputDecoration(hintText: '*100#', border: OutlineInputBorder()),
          ),

          const SizedBox(height: 16),
          const Text('SUCCESS MARKERS (comma-separated)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 8),
          TextField(
            controller: _successMarkersCtrl,
            decoration: const InputDecoration(hintText: 'successful, approved', border: OutlineInputBorder()),
          ),

          const SizedBox(height: 16),
          const Text('FAILURE MARKERS (comma-separated)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 8),
          TextField(
            controller: _failureMarkersCtrl,
            decoration: const InputDecoration(hintText: 'failed, insufficient, invalid', border: OutlineInputBorder()),
          ),

          const SizedBox(height: 20),
          const Text('STEPS (in order)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
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
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Step ${i + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        IconButton(
                          icon: const Icon(Icons.close, size: 18, color: Colors.grey),
                          onPressed: () => _removeStep(i),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text('Match if screen contains (comma-separated, ALL must match)', style: TextStyle(fontSize: 9.5, color: Colors.grey)),
                    const SizedBox(height: 4),
                    TextField(
                      controller: step.matchAllCtrl,
                      style: const TextStyle(fontSize: 12),
                      decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: 'enter phone no'),
                    ),
                    const SizedBox(height: 8),
                    const Text('Action', style: TextStyle(fontSize: 9.5, color: Colors.grey)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(border: Border.all(color: Colors.grey[300]!), borderRadius: BorderRadius.circular(6)),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: step.action,
                          isExpanded: true,
                          style: const TextStyle(fontSize: 12, color: Colors.black),
                          items: _actions.map((a) => DropdownMenuItem(value: a['value'], child: Text(a['label']!))).toList(),
                          onChanged: (v) => setState(() => step.action = v!),
                        ),
                      ),
                    ),
                    if (step.needsActionValue) ...[
                      const SizedBox(height: 8),
                      const Text('Value to send', style: TextStyle(fontSize: 9.5, color: Colors.grey)),
                      const SizedBox(height: 4),
                      TextField(
                        controller: step.actionValueCtrl,
                        style: const TextStyle(fontSize: 12),
                        decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: 'e.g. 1'),
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
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
    for (final s in _steps) {
      s.dispose();
    }
    super.dispose();
  }
}
