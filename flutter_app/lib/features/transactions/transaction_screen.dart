import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class TransactionScreen extends StatefulWidget {
  final String transactionType;
  const TransactionScreen({super.key, required this.transactionType});

  @override
  State<TransactionScreen> createState() => _TransactionScreenState();
}

class _TransactionScreenState extends State<TransactionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _customerPhoneCtrl = TextEditingController();
  final _customerNameCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _recipientPhoneCtrl = TextEditingController();
  final _billerCodeCtrl = TextEditingController();
  final _accountNumberCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  String _selectedProvider = 'mtn';
  String? _selectedBranchId;
  List<Map<String, dynamic>> _branches = [];
  bool _loading = false, _loadingBranches = true;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  Future<void> _loadBranches() async {
    try {
      final res = await ApiClient.instance.get('/branches');
      if (mounted) {
        setState(() {
          _branches = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
          if (_branches.isNotEmpty) _selectedBranchId = _branches.first['id'];
          _loadingBranches = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingBranches = false);
    }
  }

  String get _title => widget.transactionType.replaceAll('_', ' ').split(' ')
      .map((w) => w[0].toUpperCase() + w.substring(1)).join(' ');

  bool get _needsRecipient => ['send_money'].contains(widget.transactionType);
  bool get _needsBiller => ['bill_payment'].contains(widget.transactionType);
  bool get _needsAmount => !['balance_enquiry', 'mini_statement'].contains(widget.transactionType);
  bool get _needsCustomer => !['balance_enquiry', 'mini_statement'].contains(widget.transactionType);

  Future<void> _proceed() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedBranchId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a branch')));
      return;
    }


    // Telecel/AirtelTigo Cash Out: e-cash moves directly SIM-to-SIM,
    // invisible to USSD automation. Skip the dial entirely and record
    // this manually instead.
    final isManualCashOut = widget.transactionType == "cash_out" &&
        (_selectedProvider == "telecel" || _selectedProvider == "at_money");
    if (isManualCashOut) {
      await _submitManualCashOut();
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.post('/transactions', data: {
        'provider': _selectedProvider,
        'transaction_type': widget.transactionType,
        'amount': double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0,
        'customer_phone': _customerPhoneCtrl.text.trim(),
        'customer_name': _customerNameCtrl.text.trim(),
        'recipient_phone': _recipientPhoneCtrl.text.trim(),
        'biller_code': _billerCodeCtrl.text.trim(),
        'account_number': _accountNumberCtrl.text.trim(),
        'branch_id': _selectedBranchId,
        'notes': _notesCtrl.text.trim(),
      });

      if (!mounted) return;
      context.push('/transactions/progress', extra: {
        'transaction': res.data['data'],
        'provider': _selectedProvider,
        'transaction_type': widget.transactionType,
        'amount': _amountCtrl.text,
        'customer_phone': _customerPhoneCtrl.text.trim(),
        'customer_name': _customerNameCtrl.text.trim(),
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to initiate transaction';
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitManualCashOut() async {
    final amount = double.tryParse(_amountCtrl.text.replaceAll(",", ""));
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Enter the cash amount given to the customer")));
      return;
    }
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post("/balances/cash-out-manual", data: {
        "provider": _selectedProvider,
        "amount": amount,
        "reference": _customerPhoneCtrl.text.trim(),
        "notes": "Manual Cash Out - ${_customerNameCtrl.text.trim()}",
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Cash Out recorded successfully")));
        context.pop();
      }
    } on DioException catch (e) {
      final msg = e.response?.data?["message"] ?? "Failed to record Cash Out";
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: _loadingBranches
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Provider Selector
                    const Text('Select Network', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 8),
                    Row(
                      children: ['mtn', 'telecel', 'at_money'].map((p) {
                        final selected = _selectedProvider == p;
                        final color = AppTheme.providerColor(p);
                        final label = {'mtn': 'MTN MoMo', 'telecel': 'Telecel Cash', 'at_money': 'AT Money'}[p]!;
                        return Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _selectedProvider = p),
                            child: Container(
                              margin: const EdgeInsets.only(right: 8),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: selected ? color : Colors.white,
                                border: Border.all(color: selected ? color : Colors.grey[300]!),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Column(
                                children: [
                                  Icon(Icons.phone_android,
                                    color: selected ? (p == 'mtn' ? Colors.black : Colors.white) : color,
                                    size: 20),
                                  const SizedBox(height: 4),
                                  Text(label,
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 10, fontWeight: FontWeight.w600,
                                      color: selected ? (p == 'mtn' ? Colors.black : Colors.white) : Colors.grey[700],
                                    )),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 20),

                    // Branch selector
                    if (_branches.isNotEmpty) ...[
                      DropdownButtonFormField<String>(
                        value: _selectedBranchId,
                        decoration: InputDecoration(
                          labelText: 'Branch',
                          prefixIcon: const Icon(Icons.store_outlined),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        items: _branches.map((b) => DropdownMenuItem(
                          value: b['id'] as String,
                          child: Text(b['name'] as String),
                        )).toList(),
                        onChanged: (v) => setState(() => _selectedBranchId = v),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Customer Phone
                    if (_needsCustomer) ...[
                      AppTextField(
                        controller: _customerPhoneCtrl,
                        label: 'Customer Phone Number',
                        hint: '024XXXXXXX',
                        keyboardType: TextInputType.phone,
                        prefixIcon: Icons.phone_outlined,
                        validator: (v) => v!.isEmpty ? 'Customer phone is required' : null,
                      ),
                      const SizedBox(height: 14),
                      AppTextField(
                        controller: _customerNameCtrl,
                        label: 'Customer Name (optional)',
                        prefixIcon: Icons.person_outline,
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Recipient (Send Money)
                    if (_needsRecipient) ...[
                      AppTextField(
                        controller: _recipientPhoneCtrl,
                        label: 'Recipient Phone Number',
                        hint: '024XXXXXXX',
                        keyboardType: TextInputType.phone,
                        prefixIcon: Icons.person_add_outlined,
                        validator: (v) => v!.isEmpty ? 'Recipient phone is required' : null,
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Biller (Bill Payment)
                    if (_needsBiller) ...[
                      AppTextField(
                        controller: _billerCodeCtrl,
                        label: 'Biller Code',
                        prefixIcon: Icons.receipt_outlined,
                        validator: (v) => v!.isEmpty ? 'Biller code is required' : null,
                      ),
                      const SizedBox(height: 14),
                      AppTextField(
                        controller: _accountNumberCtrl,
                        label: 'Account / Meter Number',
                        keyboardType: TextInputType.number,
                        prefixIcon: Icons.numbers_outlined,
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Amount
                    if (_needsAmount) ...[
                      TextFormField(
                        controller: _amountCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        decoration: InputDecoration(
                          labelText: 'Amount (GH₵)',
                          hintText: '0.00',
                          prefixIcon: const Icon(Icons.monetization_on_outlined),
                          prefixText: 'GH₵  ',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.grey[50],
                        ),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                        validator: (v) {
                          if (v!.isEmpty) return 'Amount is required';
                          final n = double.tryParse(v);
                          if (n == null || n <= 0) return 'Enter a valid amount';
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Notes
                    AppTextField(
                      controller: _notesCtrl,
                      label: 'Notes (optional)',
                      prefixIcon: Icons.note_outlined,
                      maxLines: 2,
                    ),

                    const SizedBox(height: 24),

                    // PIN Security Notice
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue[50],
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue[200]!),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.security, color: Colors.blue, size: 18),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'You will enter your MoMo PIN only on the official network USSD screen. '
                              'Agent Pro Ghana never asks for your PIN.',
                              style: TextStyle(fontSize: 12, color: Colors.blue),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    AppButton(
                      label: 'Proceed to ${_needsAmount ? 'Confirm' : 'Execute'}',
                      onPressed: _proceed,
                      isLoading: _loading,
                      icon: Icons.arrow_forward,
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  @override
  void dispose() {
    for (final c in [_customerPhoneCtrl, _customerNameCtrl, _amountCtrl,
      _recipientPhoneCtrl, _billerCodeCtrl, _accountNumberCtrl, _notesCtrl]) {
      c.dispose();
    }
    super.dispose();
  }
}
