// personal_transaction_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

const Map<String, String> kPersonalTransactionLabels = {
  'send_money_same_network': 'Send Money (Same Network)',
  'send_money_cross_network': 'Send Money (Other Network)',
  'buy_airtime': 'Buy Airtime',
  'buy_data': 'Buy Data',
  'buy_mashup': 'Mash Up',
  'check_momo_balance': 'Check MoMo Balance',
  'check_airtime_balance': 'Check Airtime Balance',
};

// Balance-check types dial and get PIN-prompted with no amount or
// recipient ever entered - mirrors the same no-amount-type precedent
// already established on the Agent side (balance_enquiry, mini_statement).
const List<String> kNoAmountPersonalTypes = ['check_momo_balance', 'check_airtime_balance'];

class PersonalTransactionScreen extends StatefulWidget {
  final String transactionType;
  final String provider;
  final int? simSlot;
  final String? simIccid;
  const PersonalTransactionScreen({
    super.key,
    required this.transactionType,
    required this.provider,
    this.simSlot,
    this.simIccid,
  });

  @override
  State<PersonalTransactionScreen> createState() => _PersonalTransactionScreenState();
}

class _PersonalTransactionScreenState extends State<PersonalTransactionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _loading = false;

  bool get _needsAmount => !kNoAmountPersonalTypes.contains(widget.transactionType);
  bool get _needsPhone => !kNoAmountPersonalTypes.contains(widget.transactionType);

  @override
  void initState() {
    super.initState();
    // Buy Airtime/Data/Mash Up commonly top up the user's own number -
    // pre-fill with it as a sensible default, still editable to top up
    // someone else instead. Send Money always starts blank (there's no
    // sensible default recipient for that).
    if (['buy_airtime', 'buy_data', 'buy_mashup'].contains(widget.transactionType)) {
      final state = context.read<AuthBloc>().state;
      if (state is AuthAuthenticated) {
        _phoneCtrl.text = (state.user['phone'] ?? '').toString();
      }
    }
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_needsAmount && !_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      final res = await ApiClient.instance.post('/personal-transactions', data: {
        'provider': widget.provider,
        'transaction_type': widget.transactionType,
        if (_needsAmount) 'amount': double.tryParse(_amountCtrl.text.trim()),
        if (_needsPhone) 'recipient_phone': _phoneCtrl.text.trim(),
        if (widget.simIccid != null) 'sim_iccid': widget.simIccid,
        if (widget.simSlot != null) 'sim_slot': widget.simSlot,
      });

      final transaction = res.data['data'];
      if (!mounted) return;

      context.push('/transactions/progress', extra: {
        'is_personal': true,
        'transaction': transaction,
        'provider': widget.provider,
        'transaction_type': widget.transactionType,
        'amount': _needsAmount ? _amountCtrl.text.trim() : null,
        'customer_phone': _needsPhone ? _phoneCtrl.text.trim() : null,
        'request_fields': {
          if (_needsAmount) 'amount': _amountCtrl.text.trim(),
          if (_needsPhone) 'customer_phone': _phoneCtrl.text.trim(),
        },
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to start transaction. Please try again.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = kPersonalTransactionLabels[widget.transactionType] ?? widget.transactionType;

    return Scaffold(
      appBar: AppBar(title: Text(label)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              if (_needsAmount) ...[
                AppTextField(
                  controller: _amountCtrl,
                  label: 'Amount (GHS)',
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  prefixIcon: Icons.payments_outlined,
                  validator: (v) {
                    final n = double.tryParse((v ?? '').trim());
                    if (n == null || n <= 0) return 'Enter a valid amount';
                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],
              if (_needsPhone) ...[
                AppTextField(
                  controller: _phoneCtrl,
                  label: 'Recipient Phone',
                  keyboardType: TextInputType.phone,
                  prefixIcon: Icons.phone_outlined,
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 14),
              ],
              if (!_needsAmount)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: context.isDarkMode ? const Color(0xFF1A2B45) : Colors.blue[50], borderRadius: BorderRadius.circular(8)),
                  child: Text(
                    'This will dial your $label enquiry - no amount or recipient needed.',
                    style: TextStyle(fontSize: 12, color: context.isDarkMode ? const Color(0xFF8FB8E8) : const Color(0xFF1A4D8F)),
                  ),
                ),
              const SizedBox(height: 24),
              AppButton(label: 'Continue', onPressed: _submit, isLoading: _loading),
            ],
          ),
        ),
      ),
    );
  }
}
