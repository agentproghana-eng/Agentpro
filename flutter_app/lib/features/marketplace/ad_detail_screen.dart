import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class AdDetailScreen extends StatefulWidget {
  final String adId;
  const AdDetailScreen({super.key, required this.adId});

  @override
  State<AdDetailScreen> createState() => _AdDetailScreenState();
}

class _AdDetailScreenState extends State<AdDetailScreen> {
  Map<String, dynamic>? _ad;
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
      final res = await ApiClient.instance.get('/marketplace/${widget.adId}');
      if (mounted) {
        setState(() {
          _ad = res.data['data'];
          _loading = false;
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.response?.data?['message'] ?? 'Failed to load ad';
          _loading = false;
        });
      }
    }
  }

  void _showPaymentSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AdPaymentSheet(
        adId: widget.adId,
        fee: double.tryParse(_ad?['publishing_fee']?.toString() ?? '0') ?? 0,
        onSubmitted: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ad Status')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load ad',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final ad = _ad!;
    final status = ad['status'] as String? ?? '';
    final price = ad['price'] != null ? double.tryParse(ad['price'].toString()) : null;
    final fee = double.tryParse(ad['publishing_fee']?.toString() ?? '0') ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(ad['title'] ?? '',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      ),
                      StatusBadge(status: status),
                    ],
                  ),
                  if (price != null) ...[
                    const SizedBox(height: 8),
                    GhsAmount(amount: price, fontSize: 20),
                  ],
                  const SizedBox(height: 12),
                  Text(ad['description'] ?? '', style: TextStyle(color: Colors.grey[700])),
                  if (ad['location'] != null) ...[
                    const SizedBox(height: 12),
                    Row(children: [
                      Icon(Icons.location_on_outlined, size: 16, color: Colors.grey[500]),
                      const SizedBox(width: 4),
                      Text(ad['location'], style: TextStyle(color: Colors.grey[600], fontSize: 13)),
                    ]),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          _StatusExplainer(status: status, fee: fee, expiresAt: ad['expires_at'], rejectionReason: ad['rejection_reason']),

          if (status == 'pending_payment') ...[
            const SizedBox(height: 20),
            AppButton(
              label: 'Pay GH₵ ${fee.toStringAsFixed(2)} & Submit Reference',
              icon: Icons.payment,
              onPressed: _showPaymentSheet,
            ),
          ],
        ],
      ),
    );
  }
}

/// Explains what the current status means and what (if anything) the
/// user needs to do next — the marketplace lifecycle has five distinct
/// states and a generic status badge alone doesn't tell a non-technical
/// user what to actually do.
class _StatusExplainer extends StatelessWidget {
  final String status;
  final double fee;
  final String? expiresAt;
  final String? rejectionReason;

  const _StatusExplainer({
    required this.status,
    required this.fee,
    this.expiresAt,
    this.rejectionReason,
  });

  @override
  Widget build(BuildContext context) {
    final (icon, color, title, body) = switch (status) {
      'pending_review' => (
        Icons.hourglass_top,
        AppTheme.secondaryColor,
        'Awaiting Review',
        'Our team is reviewing your ad. You\'ll be notified once it\'s '
            'approved and ready for payment — usually within 24 hours.',
      ),
      'pending_payment' => (
        Icons.payment,
        AppTheme.secondaryColor,
        'Approved — Payment Required',
        'Your ad was approved! Pay the GH₵ ${fee.toStringAsFixed(2)} publishing '
            'fee via MTN MoMo below, then submit your payment reference to go live.',
      ),
      'active' => (
        Icons.check_circle,
        AppTheme.successColor,
        'Live on Business Hub',
        expiresAt != null
            ? 'Your ad is published and visible to all users until '
                '${DateFormat('dd MMM yyyy').format(DateTime.parse(expiresAt!))}.'
            : 'Your ad is published and visible to all users.',
      ),
      'rejected' => (
        Icons.cancel,
        AppTheme.errorColor,
        'Not Approved',
        rejectionReason ?? 'This ad did not meet our content guidelines. '
            'Contact support if you have questions.',
      ),
      'expired' => (
        Icons.event_busy,
        Colors.grey,
        'Expired',
        'This ad\'s 30-day listing period has ended. Post a new ad to relist.',
      ),
      _ => (Icons.info_outline, Colors.grey, status, ''),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: color)),
          ]),
          if (body.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(body, style: const TextStyle(fontSize: 13)),
          ],
        ],
      ),
    );
  }
}

/// Bottom sheet for submitting the MoMo payment reference for an
/// approved ad — mirrors the same pattern as subscription_screen.dart's
/// payment submission flow for consistency.
class _AdPaymentSheet extends StatefulWidget {
  final String adId;
  final double fee;
  final VoidCallback onSubmitted;

  const _AdPaymentSheet({required this.adId, required this.fee, required this.onSubmitted});

  @override
  State<_AdPaymentSheet> createState() => _AdPaymentSheetState();
}

class _AdPaymentSheetState extends State<_AdPaymentSheet> {
  final _refCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;

  Future<void> _submit() async {
    if (_refCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in both fields')));
      return;
    }

    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post('/marketplace/${widget.adId}/payment', data: {
        'momo_reference': _refCtrl.text.trim(),
        'payment_phone': _phoneCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment reference submitted. Awaiting verification.')));
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to submit payment';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Submit Payment Reference', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('Pay GH₵ ${widget.fee.toStringAsFixed(2)} via MTN MoMo, then enter your reference below.',
            style: TextStyle(color: Colors.grey[600], fontSize: 13)),
          const SizedBox(height: 16),
          TextField(
            controller: _refCtrl,
            decoration: const InputDecoration(
              labelText: 'MTN MoMo Reference',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.receipt),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone used to pay',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.phone),
            ),
          ),
          const SizedBox(height: 20),
          AppButton(label: 'Submit Reference', onPressed: _submit, isLoading: _submitting),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _refCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }
}
