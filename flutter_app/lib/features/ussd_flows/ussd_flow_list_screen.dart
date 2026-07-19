import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import 'ussd_flow_editor_screen.dart';

// Lists USSD flows: global (superuser-owned, shared by every company,
// read-only here) and this company's own flows (editable). Business
// owners create/edit flows here for any provider/transaction_type
// MTN/Telecel's built-in automation doesn't already cover.
class UssdFlowListScreen extends StatefulWidget {
  const UssdFlowListScreen({super.key});

  @override
  State<UssdFlowListScreen> createState() => _UssdFlowListScreenState();
}

class _UssdFlowListScreenState extends State<UssdFlowListScreen> {
  List<dynamic> _flows = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.get('/ussd-flows');
      setState(() {
        _flows = res.data['data'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load USSD flows';
        _loading = false;
      });
    }
  }

  String _providerLabel(String p) => switch (p) {
    'mtn' => 'MTN',
    'telecel' => 'Telecel',
    'at_money' => 'AT Money',
    _ => p,
  };

  Future<void> _openFlow(Map<String, dynamic> flow) async {
    final isGlobal = flow['company_id'] == null;
    if (isGlobal) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Global flows are managed centrally and are read-only here.')));
      return;
    }
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => UssdFlowEditorScreen(existingFlow: flow)),
    );
    if (result == true) _load();
  }

  Future<void> _createFlow() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const UssdFlowEditorScreen()),
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('USSD Flows')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _flows.isEmpty
                  ? const Center(child: Text('No USSD flows yet.\nTap + to create one.', textAlign: TextAlign.center))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _flows.length,
                        itemBuilder: (_, i) {
                          final flow = _flows[i] as Map<String, dynamic>;
                          final isGlobal = flow['company_id'] == null;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              title: Text(
                                '${_providerLabel(flow['provider'] ?? '')} · ${(flow['transaction_type'] ?? '').toString().replaceAll('_', ' ')}',
                                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                              ),
                              subtitle: Text(
                                '${flow['dial_code'] ?? ''} · ${isGlobal ? 'Managed centrally' : 'Your company'}',
                                style: const TextStyle(fontSize: 11),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: isGlobal ? const Color(0xFFE8E0FF) : const Color(0xFFE6F4F1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  isGlobal ? 'GLOBAL' : 'MY COMPANY',
                                  style: TextStyle(
                                    fontSize: 8, fontWeight: FontWeight.w800,
                                    color: isGlobal ? const Color(0xFF5B3FA0) : AppTheme.primaryColor,
                                  ),
                                ),
                              ),
                              onTap: () => _openFlow(flow),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createFlow,
        backgroundColor: AppTheme.secondaryColor,
        child: const Icon(Icons.add, color: Colors.black),
      ),
    );
  }
}
