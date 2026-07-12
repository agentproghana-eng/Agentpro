import "package:flutter/material.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";
import "../../shared/widgets/app_widgets.dart";
import "../transactions/transaction_detail_screen.dart";

class StaffWorkHistoryScreen extends StatefulWidget {
  final String userId;
  final String userName;
  const StaffWorkHistoryScreen({super.key, required this.userId, required this.userName});

  @override
  State<StaffWorkHistoryScreen> createState() => _StaffWorkHistoryScreenState();
}

class _StaffWorkHistoryScreenState extends State<StaffWorkHistoryScreen> {
  List<dynamic> _transactions = [];
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
      final res = await ApiClient.instance.get("/transactions",
          queryParameters: {"agent_id": widget.userId, "limit": 50});
      setState(() {
        _transactions = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = "Could not load transaction history"; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("${widget.userName} - Work History")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _transactions.isEmpty
                  ? const EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: "No transactions yet",
                      subtitle: "This person has not processed any transactions",
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(8),
                        itemCount: _transactions.length,
                        itemBuilder: (_, i) {
                          final tx = _transactions[i] as Map<String, dynamic>;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 6),
                            child: ListTile(
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => TransactionDetailScreen(transactionId: tx["id"]),
                                ),
                              ),
                              title: Text(
                                "${(tx["transaction_type"] ?? "").toString().toUpperCase()} - GH₵${tx["amount"] ?? "0.00"}"),
                              subtitle: Text(
                                "${tx["provider"] ?? ""} - ${tx["branch_name"] ?? ""} - ${(tx["created_at"] ?? "").toString().split("T").first}"),
                              trailing: StatusBadge(status: tx["status"] ?? ""),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
