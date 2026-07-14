import "package:flutter/material.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class PendingApprovalsScreen extends StatefulWidget {
  const PendingApprovalsScreen({super.key});

  @override
  State<PendingApprovalsScreen> createState() => _PendingApprovalsScreenState();
}

class _PendingApprovalsScreenState extends State<PendingApprovalsScreen> {
  List<dynamic> _pending = [];
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
      final res = await ApiClient.instance.get("/balances/pending-adjustments");
      setState(() {
        _pending = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = "Could not load pending approvals"; _loading = false; });
    }
  }

  Future<void> _review(String movementId, String action) async {
    try {
      await ApiClient.instance.patch("/balances/cash-adjustment/$movementId/review", data: {
        "action": action,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(action == "approve" ? "Approved" : "Rejected")));
      }
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Failed to submit review"), backgroundColor: AppTheme.errorColor));
    }
  }

  String _providerLabel(String p) {
    switch (p) {
      case "mtn": return "MTN";
      case "telecel": return "Telecel";
      case "at_money": return "AirtelTigo";
      default: return p;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Pending Approvals")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _pending.isEmpty
                  ? const Center(child: Text("No pending requests"))

                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _pending.length,
                        itemBuilder: (_, i) {
                          final item = _pending[i] as Map<String, dynamic>;
                          return _ApprovalCard(
                            agentName: '${item['first_name'] ?? ''} ${item['last_name'] ?? ''}',
                            providerLabel: _providerLabel(item["provider"]),
                            movementType: item["movement_type"],
                            amount: (double.tryParse(item["amount"].toString().replaceAll("-", "")) ?? 0).toStringAsFixed(2),
                            notes: item["notes"] as String?,
                            onApprove: () => _review(item["id"], "approve"),
                            onReject: () => _review(item["id"], "reject"),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  final String agentName;
  final String providerLabel;
  final String movementType;
  final String amount;
  final String? notes;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _ApprovalCard({
    required this.agentName,
    required this.providerLabel,
    required this.movementType,
    required this.amount,
    required this.notes,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final isInjection = movementType == "cash_injection";
    return Container(
      padding: const EdgeInsets.all(13),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(agentName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            Text(providerLabel, style: const TextStyle(fontSize: 10.5, color: Colors.grey)),
          ]),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: isInjection ? const Color(0xFFE1F5E9) : const Color(0xFFFBE4E4), borderRadius: BorderRadius.circular(8)),
            child: Text(isInjection ? "INJECTION" : "WITHDRAWAL", style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: isInjection ? const Color(0xFF1B7A43) : const Color(0xFFA33333))),
          ),
        ]),
        const SizedBox(height: 8),
        Text("GH₵ $amount", style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
        if (notes != null && notes!.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(notes ?? "", style: const TextStyle(fontSize: 11, color: Colors.grey, fontStyle: FontStyle.italic)),
        ],
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: onReject, child: const Text("Reject"))),
          const SizedBox(width: 8),
          Expanded(child: ElevatedButton(onPressed: onApprove, style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor), child: const Text("Approve"))),
        ]),
      ]),
    );
  }
}
