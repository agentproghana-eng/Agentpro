// subscription_screen.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import 'subscription_payment_service.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});
  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _loadError;
  final _refCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;
  bool _paystackBusy = false;
  bool _checkoutLaunched = false;
  bool _automaticVerificationPending = false;
  String? _paystackReference;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _restorePaystackReference();
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _checkoutLaunched) {
      _checkoutLaunched = false;
      _automaticVerificationPending = true;
      _runAutomaticPaystackVerification();
    }
  }

  Future<void> _restorePaystackReference() async {
    final reference = await SubscriptionPaymentService.restorePendingReference(
      SubscriptionAccountKind.business,
    );

    if (!mounted) return;

    setState(() {
      _paystackReference = reference;
    });

    if (reference == null || reference.trim().isEmpty) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _checkoutLaunched) {
        return;
      }

      _automaticVerificationPending = true;
      _runAutomaticPaystackVerification();
    });
  }

  Future<void> _runAutomaticPaystackVerification() async {
    if (!_automaticVerificationPending || _paystackBusy || !mounted) {
      return;
    }

    _automaticVerificationPending = false;

    await _verifyPaystack(showPendingMessage: false);

    if (!mounted || _paystackReference == null || _paystackBusy) {
      return;
    }

    await Future<void>.delayed(const Duration(seconds: 2));

    if (!mounted || _paystackReference == null || _paystackBusy) {
      return;
    }

    await _verifyPaystack(showPendingMessage: false);
  }

  Future<void> _startPaystack() async {
    if (_paystackBusy) return;

    setState(() {
      _paystackBusy = true;
    });

    try {
      final session = await SubscriptionPaymentService.initializePaystack(
        SubscriptionAccountKind.business,
      );

      if (!mounted) return;

      setState(() {
        _paystackReference = session.reference;
        _checkoutLaunched = true;
      });

      final launched = await SubscriptionPaymentService.launchCheckout(
        session.authorizationUrl,
      );

      if (!launched && mounted) {
        setState(() {
          _checkoutLaunched = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('The secure payment page could not be opened.'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            SubscriptionPaymentService.errorMessage(
              error,
              fallback: 'Paystack payment could not be started.',
            ),
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _paystackBusy = false;
        });
      }

      await _runAutomaticPaystackVerification();
    }
  }

  Future<void> _verifyPaystack({bool showPendingMessage = true}) async {
    if (_paystackBusy) return;

    var reference = _paystackReference;

    reference ??= await SubscriptionPaymentService.restorePendingReference(
      SubscriptionAccountKind.business,
    );

    if (reference == null || reference.trim().isEmpty) {
      if (showPendingMessage && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'There is no Paystack payment waiting to be checked.',
            ),
          ),
        );
      }

      return;
    }

    if (mounted) {
      setState(() {
        _paystackBusy = true;
      });
    }

    try {
      final result = await SubscriptionPaymentService.verifyPaystack(
        SubscriptionAccountKind.business,
        reference,
      );

      if (!mounted) return;

      if (result.activated) {
        await SubscriptionPaymentService.clearPendingReference(
          SubscriptionAccountKind.business,
        );

        if (!mounted) return;

        setState(() {
          _paystackReference = null;
        });

        await _load();

        if (!mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment confirmed. Your subscription is active.'),
          ),
        );

        return;
      }

      if (result.outcome == 'reconciliation_required') {
        await SubscriptionPaymentService.clearPendingReference(
          SubscriptionAccountKind.business,
        );

        if (!mounted) return;

        setState(() {
          _paystackReference = null;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Your payment was received, but this subscription cycle was already fulfilled. No extra subscription period was added. Please contact support so the payment can be reconciled or refunded.',
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );

        return;
      }

      if (showPendingMessage) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.message ??
                  'Payment has not been confirmed yet. You can check again.',
            ),
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;

      if (showPendingMessage) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              SubscriptionPaymentService.errorMessage(
                error,
                fallback: 'Payment status could not be checked.',
              ),
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _paystackBusy = false;
        });
      }
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }

    try {
      final res = await ApiClient.instance.get('/subscriptions/status');
      final rawData = res.data['data'];

      if (rawData is! Map) {
        throw const FormatException('Invalid subscription status response');
      }

      if (!mounted) return;

      setState(() {
        _data = Map<String, dynamic>.from(rawData);
        _loading = false;
        _loadError = null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _loadError =
            'Your subscription could not be loaded. Check your connection and try again.';
      });
    }
  }

  Future<void> _submitPayment() async {
    if (_refCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter both the MoMo reference and the phone used to pay.',
          ),
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '/subscriptions/payment',
        data: {
          'momo_reference': _refCtrl.text.trim(),
          'payment_phone': _phoneCtrl.text.trim(),
        },
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment submitted! Pending verification.'),
          ),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              SubscriptionPaymentService.errorMessage(
                e,
                fallback: 'Manual payment submission failed.',
              ),
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sub = _data?['subscription'];
    final instructions = _data?['payment_instructions'];
    final status = sub?['status'] ?? 'unknown';
    final expiresAt = sub?['expires_at'];

    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_outlined, size: 48),
                    const SizedBox(height: 12),
                    Text(
                      _loadError!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.appSecondaryText),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Try Again'),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Status Card
                Card(
                  color: status == 'active'
                      ? AppTheme.successColor.withValues(alpha: 0.1)
                      : AppTheme.errorColor.withValues(alpha: 0.1),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Icon(
                          status == 'active'
                              ? Icons.check_circle
                              : Icons.warning,
                          color: status == 'active'
                              ? AppTheme.successColor
                              : AppTheme.errorColor,
                          size: 48,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          status == 'active'
                              ? 'Business Plan — Active'
                              : 'Subscription ${status.toUpperCase()}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (expiresAt != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Expires: ${DateFormat('dd MMM yyyy').format(DateTime.parse(expiresAt))}',
                            style: TextStyle(color: context.appPrimaryText),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Plan Features
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Business Plan — GH₵${((_data?["payment_instructions"]?["amount"] as num?) ?? 10).toStringAsFixed(2)}/month",
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 12),
                        for (final f in [
                          'All Mobile Money transactions (MTN, Telecel, AT)',
                          'Multi-branch management',
                          'Float management & alerts',
                          'Commission tracking',
                          'Reports (PDF, Excel, CSV)',
                          'Business Hub (Marketplace)',
                          'AI Assistant',
                          'Push notifications',
                          'Cloud sync',
                        ])
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.check,
                                  color: AppTheme.successColor,
                                  size: 16,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    f,
                                    style: const TextStyle(fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.verified_user_outlined),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Pay with Paystack — Instant Activation',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Complete payment on the secure hosted checkout. '
                          'AgentPro activates access only after the backend confirms the payment.',
                          style: TextStyle(
                            color: context.appSecondaryText,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 16),
                        AppButton(
                          label: status == 'active'
                              ? 'Renew with Paystack'
                              : 'Pay with Paystack',
                          icon: Icons.open_in_new,
                          onPressed: _startPaystack,
                          isLoading: _paystackBusy,
                        ),
                        if (_paystackReference != null) ...[
                          const SizedBox(height: 8),
                          Center(
                            child: TextButton.icon(
                              onPressed: _paystackBusy
                                  ? null
                                  : () => _verifyPaystack(),
                              icon: const Icon(Icons.refresh),
                              label: const Text('Check payment status'),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Payment Instructions
                if (instructions != null)
                  Builder(
                    builder: (context) => Card(
                      color: context.isDarkMode
                          ? const Color(0xFF332B15)
                          : Colors.amber[50],
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: DefaultTextStyle.merge(
                          style: TextStyle(
                            color: context.isDarkMode
                                ? AppTheme.secondaryColor
                                : const Color(0xFF7A5B00),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Pay Manually — Requires Verification',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '1. Send GH₵${instructions['amount']} via MTN MoMo',
                              ),
                              Text(
                                '2. To: ${instructions['merchant_number']} (${instructions['merchant_name']})',
                              ),
                              const Text('3. Copy the transaction reference'),
                              const Text('4. Submit the reference below'),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),

                AppButton(
                  label: status == 'active'
                      ? 'Submit Manual Renewal'
                      : 'Submit Manual Payment',
                  icon: Icons.payment,
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(20),
                      ),
                    ),
                    builder: (_) => Padding(
                      padding: EdgeInsets.fromLTRB(
                        16,
                        16,
                        16,
                        MediaQuery.of(context).viewInsets.bottom + 16,
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Submit Manual Payment Reference',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
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
                          AppButton(
                            label: 'Submit Reference for Verification',
                            onPressed: _submitPayment,
                            isLoading: _submitting,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
