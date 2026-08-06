import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../shared/theme/app_colors.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/utils/transaction_labels.dart';

class DashboardRecentTransactionItem extends StatelessWidget {
  final Map<String, dynamic> transaction;

  const DashboardRecentTransactionItem({
    super.key,
    required this.transaction,
  });

  @override
  Widget build(BuildContext context) {
    final type = (transaction['transaction_type'] ?? '').toString();
    final isCashIn = type == 'cash_in';
    final amount = double.tryParse(
          transaction['amount']?.toString() ?? '0',
        ) ??
        0;

    final createdAt = DateTime.tryParse(
      transaction['created_at']?.toString() ?? '',
    );

    final time = createdAt == null
        ? ''
        : DateFormat('HH:mm').format(createdAt.toLocal());

    return GestureDetector(
      onTap: () => context.push(
        '/transactions/${transaction['id']}',
      ),
      child: Container(
        padding: const EdgeInsets.all(11),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 3,
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isCashIn
                    ? context.appTileColor(
                        const Color(0xFFE6F4F1),
                      )
                    : context.appTileColor(
                        const Color(0xFFFDF3DC),
                      ),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(
                isCashIn ? Icons.call_received : Icons.call_made,
                size: 16,
                color:
                    isCashIn ? AppTheme.primaryColor : const Color(0xFFB87E00),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    transactionTypeLabel(
                      type,
                      (transaction['provider'] ?? '').toString(),
                    ),
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '${transaction['customer_phone'] ?? ''}'
                    ' · $time',
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Colors.grey,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '${isCashIn ? '+' : '-'}'
              'GH₵${amount.toStringAsFixed(2)}',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.bold,
                color:
                    isCashIn ? AppTheme.primaryColor : const Color(0xFFB33F3F),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
