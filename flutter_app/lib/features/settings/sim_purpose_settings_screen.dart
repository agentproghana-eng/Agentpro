// sim_purpose_settings_screen.dart
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

/// Lets a user holding both Business and Personal capability tag which
/// physical SIM is for Agent work vs Personal use. SimCardService only
/// identifies which network a SIM is on, not which "hat" it's for - an
/// agent line and a personal number can easily share the same network.
class SimPurposeSettingsScreen extends StatefulWidget {
  const SimPurposeSettingsScreen({super.key});
  @override
  State<SimPurposeSettingsScreen> createState() => _SimPurposeSettingsScreenState();
}

class _SimPurposeSettingsScreenState extends State<SimPurposeSettingsScreen> {
  List<SimCard> _simCards = [];
  Map<int, String> _purposes = {}; // slot -> 'agent'/'personal'
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final cards = await SimCardService.getSimCards();
      final res = await ApiClient.instance.get('/user-sim-purposes');
      final saved = (res.data['data'] as List?) ?? [];
      final purposes = <int, String>{};
      for (final p in saved) {
        purposes[p['sim_slot'] as int] = p['purpose'] as String;
      }
      if (mounted) {
        setState(() {
          _simCards = cards;
          _purposes = purposes;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _error = 'Failed to load SIM information'; _loading = false; });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final assignments = _simCards.map((c) => {
        'sim_slot': c.slot,
        'sim_iccid': c.iccid.isNotEmpty ? c.iccid : null,
        'purpose': _purposes[c.slot] ?? 'agent',
      }).toList();
      await ApiClient.instance.put('/user-sim-purposes', data: {'assignments': assignments});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SIM assignments saved ✅')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to save'), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _networkLabel(String network) {
    switch (network) {
      case 'mtn': return 'MTN';
      case 'telecel': return 'Telecel';
      case 'at_money': return 'AT Money';
      default: return 'Unknown';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SIM Purpose')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _simCards.isEmpty
                  ? const EmptyState(icon: Icons.sim_card_alert, title: 'No SIM cards detected')
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.blue[50],
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.blue[200]!),
                          ),
                          child: const Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.info_outline, color: Colors.blue, size: 18),
                              SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Tell the app which SIM is for your Business (Agent) work and which is for your own Personal use.',
                                  style: TextStyle(fontSize: 12, color: Colors.blue),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        for (final card in _simCards) ...[
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('SIM ${card.slot + 1} \u00b7 ${_networkLabel(card.network)}',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                  const SizedBox(height: 12),
                                  Row(children: [
                                    Expanded(
                                      child: ChoiceChip(
                                        label: const Text('Agent'),
                                        selected: (_purposes[card.slot] ?? 'agent') == 'agent',
                                        onSelected: (_) => setState(() => _purposes[card.slot] = 'agent'),
                                        selectedColor: AppTheme.primaryColor.withOpacity(0.2),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: ChoiceChip(
                                        label: const Text('Personal'),
                                        selected: (_purposes[card.slot] ?? 'agent') == 'personal',
                                        onSelected: (_) => setState(() => _purposes[card.slot] = 'personal'),
                                        selectedColor: AppTheme.primaryColor.withOpacity(0.2),
                                      ),
                                    ),
                                  ]),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        const SizedBox(height: 12),
                        AppButton(label: 'Save', onPressed: _save, isLoading: _saving),
                      ],
                    ),
    );
  }
}
