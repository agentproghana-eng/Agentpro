// personal_transaction_item.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../theme/app_colors.dart';
import '../../features/transactions/personal_transaction_screen.dart'
    show kPersonalTransactionLabels;

/// Shared between Personal Home's Recent Transactions preview and the
/// full Personal Transaction History screen. Status-colored rather
/// than the Agent version's incoming/outgoing polarity - Personal
/// transactions don't have a natural money-in vs money-out split the
/// way Agent's cash_in/cash_out do (every Personal transaction is
/// essentially the user acting on their own wallet), so
/// success/failed/pending is the more meaningful signal to show here.
class PersonalTransactionItem extends StatelessWidget {
  final Map<String, dynamic> tx;
  const PersonalTransactionItem({super.key, required this.tx});

  static const _icons = {
    'send_money_same_network': Icons.send_outlined,
    'send_money_cross_network': Icons.compare_arrows,
    'buy_airtime': Icons.phone_android_outlined,
    'buy_data': Icons.wifi_outlined,
    'buy_mashup': Icons.card_giftcard_outlined,
    'check_momo_balance': Icons.account_balance_wallet_outlined,
    'check_airtime_balance': Icons.sim_card_outlined,
  };

  Color _statusColor(String status) {
    switch (status) {
      case 'success':
        return AppTheme.primaryColor;
      case 'failed':
        return const Color(0xFFB33F3F);
      default:
        return const Color(0xFFB87E00);
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = (tx['transaction_type'] ?? '').toString();
    final status = (tx['status'] ?? '').toString();
    final amount =
        tx['amount'] != null ? double.tryParse(tx['amount'].toString()) : null;
    DateTime? created;
    try {
      created = DateTime.parse(tx['created_at'].toString());
    } catch (_) {}
    final timeStr =
        created != null ? DateFormat('HH:mm').format(created.toLocal()) : '';

    return Container(
      padding: const EdgeInsets.all(11),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.05), blurRadius: 3)
          ]),
      child: Row(children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
              color: context.appTileColor(const Color(0xFFE6F4F1)),
              borderRadius: BorderRadius.circular(9)),
          child: Icon(_icons[type] ?? Icons.receipt_long_outlined,
              size: 16, color: AppTheme.primaryColor),
        ),
        const SizedBox(width: 10),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(kPersonalTransactionLabels[type] ?? type,
              style:
                  const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
          Text('${tx['recipient_phone'] ?? ''} \u00b7 $timeStr',
              style: TextStyle(
                  fontSize: 10.5,
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.w700)),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (amount != null)
            Text('GH\u20b5${amount.toStringAsFixed(2)}',
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.bold)),
          Text(status.toUpperCase(),
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: _statusColor(status))),
        ]),
      ]),
    );
  }
}
