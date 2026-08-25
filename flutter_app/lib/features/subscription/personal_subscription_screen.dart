// personal_subscription_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import 'subscription_payment_service.dart';

class PersonalSubscriptionScreen extends StatefulWidget {
  const PersonalSubscriptionScreen({super.key});
  @override
  State<PersonalSubscriptionScreen> createState() =>
      _PersonalSubscriptionScreenState();
}

class _PersonalSubscriptionScreenState extends State<PersonalSubscriptionScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _data;
  bool _loading = true;
  final _refCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;
  bool _paystackBusy = false;
  bool _checkoutLaunched = false;
  String? _paystackReference;
  String? _loadError;

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
  void didChangeAppLifecycleState(
    AppLifecycleState state,
  ) {
    if (state == AppLifecycleState.resumed &&
        _checkoutLaunched &&
        !_paystackBusy) {
      _checkoutLaunched = false;
      _verifyPaystack(
        showPendingMessage: false,
      );
    }
  }

  Future<void> _restorePaystackReference() async {
    final reference = await SubscriptionPaymentService.restorePendingReference(
      SubscriptionAccountKind.personal,
    );

    if (!mounted) return;

    setState(() {
      _paystackReference = reference;
    });
  }

  Future<void> _startPaystack() async {
    if (_paystackBusy) return;

    setState(() {
      _paystackBusy = true;
    });

    try {
      final session = await SubscriptionPaymentService.initializePaystack(
        SubscriptionAccountKind.personal,
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
            content: Text(
              'The secure payment page could not be opened.',
            ),
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
    }
  }

  Future<void> _verifyPaystack({
    bool showPendingMessage = true,
  }) async {
    if (_paystackBusy) return;

    var reference = _paystackReference;

    reference ??= await SubscriptionPaymentService.restorePendingReference(
      SubscriptionAccountKind.personal,
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
        SubscriptionAccountKind.personal,
        reference,
      );

      if (!mounted) return;

      if (result.activated) {
        await SubscriptionPaymentService.clearPendingReference(
          SubscriptionAccountKind.personal,
        );

        if (!mounted) return;

        setState(() {
          _paystackReference = null;
        });

        await _load();

        if (!mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Payment confirmed. Your Personal subscription is active.',
            ),
          ),
        );

        return;
      }

      if (result.outcome == 'reconciliation_required') {
        await SubscriptionPaymentService.clearPendingReference(
          SubscriptionAccountKind.personal,
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
      final res = await ApiClient.instance.get(
        '/personal-subscription/status',
      );

      final rawData = res.data['data'];

      if (rawData is! Map) {
        throw const FormatException(
          'Invalid Personal subscription response.',
        );
      }

      final data = Map<String, dynamic>.from(
        rawData,
      );

      final rawSubscription = data['subscription'];

      if (rawSubscription is! Map) {
        throw const FormatException(
          'Invalid Personal subscription status.',
        );
      }

      final subscription = Map<String, dynamic>.from(
        rawSubscription,
      );

      if (!mounted) return;

      context.read<AuthBloc>().add(
            AuthUpdateUserEvent({
              'personal_subscription_plan': subscription['plan'],
              'personal_subscription_expires_at': subscription['expires_at'],
            }),
          );

      setState(() {
        _data = data;
        _loading = false;
        _loadError = null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _loadError =
            'Your Personal subscription could not be loaded. Check your connection and try again.';
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
      await ApiClient.instance.post('/personal-subscription/payment', data: {
        'momo_reference': _refCtrl.text.trim(),
        'payment_phone': _phoneCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Payment submitted! Pending verification.')));
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
    final plan = sub?['plan'] ?? 'free';
    final expiresAt = sub?['expires_at'];
    final isPaid = plan == 'paid';

    return Scaffold(
      appBar: AppBar(title: const Text('My Subscription')),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(),
            )
          : _loadError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.cloud_off_outlined,
                          size: 48,
                        ),
                        const SizedBox(
                          height: 12,
                        ),
                        Text(
                          _loadError!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: context.appSecondaryText,
                          ),
                        ),
                        const SizedBox(
                          height: 16,
                        ),
                        ElevatedButton.icon(
                          onPressed: _load,
                          icon: const Icon(
                            Icons.refresh,
                          ),
                          label: const Text(
                            'Try Again',
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Card(
                    color: isPaid
                        ? AppTheme.successColor.withValues(alpha: 0.1)
                        : Colors.grey.withValues(alpha: 0.1),
                    child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(children: [
                          Icon(isPaid ? Icons.check_circle : Icons.info_outline,
                              color: isPaid
                                  ? AppTheme.successColor
                                  : context.appPrimaryText,
                              size: 48),
                          const SizedBox(height: 8),
                          Text(
                              isPaid
                                  ? 'Personal Plan — Paid'
                                  : 'Personal Plan — Free',
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.bold)),
                          if (isPaid && expiresAt != null) ...[
                            const SizedBox(height: 4),
                            Text(
                                'Renews/Expires: ${DateFormat('dd MMM yyyy').format(DateTime.parse(expiresAt))}',
                                style:
                                    TextStyle(color: context.appPrimaryText)),
                          ],
                        ])),
                  ),
                  const SizedBox(height: 16),
                  Card(
                      child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Free — Included',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16)),
                              const SizedBox(height: 12),
                              for (final f in [
                                'Send Money, Buy Airtime/Data/Mash Up',
                                'Check MoMo & Airtime Balance',
                                'View & react to Personal Community posts',
                                'Browse & post in the Business Hub',
                              ])
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(children: [
                                    const Icon(Icons.check,
                                        color: AppTheme.successColor, size: 16),
                                    const SizedBox(width: 8),
                                    Expanded(
                                        child: Text(f,
                                            style:
                                                const TextStyle(fontSize: 13))),
                                  ]),
                                ),
                            ],
                          ))),
                  const SizedBox(height: 16),
                  Card(
                      child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Paid Plan — GH₵5.00/month',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16)),
                              const SizedBox(height: 12),
                              for (final f in [
                                'Post, comment & reply in the Personal Community',
                                'USSD Automation (auto-dial transactions)',
                                'Custom USSD Flows',
                                'Transaction Reports (PDF & CSV)',
                                'No ads',
                              ])
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(children: [
                                    Icon(Icons.check,
                                        color: isPaid
                                            ? AppTheme.successColor
                                            : Colors.grey,
                                        size: 16),
                                    const SizedBox(width: 8),
                                    Expanded(
                                        child: Text(f,
                                            style:
                                                const TextStyle(fontSize: 13))),
                                  ]),
                                ),
                            ],
                          ))),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(
                                Icons.verified_user_outlined,
                              ),
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
                            'AgentPro activates your Personal subscription only after backend confirmation.',
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 16),
                          AppButton(
                            label: isPaid
                                ? 'Renew with Paystack'
                                : 'Upgrade with Paystack',
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
                                icon: const Icon(
                                  Icons.refresh,
                                ),
                                label: const Text(
                                  'Check payment status',
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (instructions != null)
                    Card(
                      color: context.isDarkMode
                          ? const Color(0xFF332B15)
                          : Colors.amber[50],
                      child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: DefaultTextStyle.merge(
                            style: TextStyle(
                                color: context.isDarkMode
                                    ? AppTheme.secondaryColor
                                    : const Color(0xFF7A5B00)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                    'Pay Manually — Requires Verification',
                                    style:
                                        TextStyle(fontWeight: FontWeight.bold)),
                                const SizedBox(height: 8),
                                Text(
                                    '1. Send GH₵${instructions['amount']} via MTN MoMo'),
                                Text(
                                    '2. To: ${instructions['merchant_number']} (${instructions['merchant_name']})'),
                                const Text('3. Copy the transaction reference'),
                                const Text('4. Submit the reference below'),
                              ],
                            ),
                          )),
                    ),
                  const SizedBox(height: 16),
                  AppButton(
                    label: isPaid
                        ? 'Submit Manual Renewal'
                        : 'Submit Manual Payment',
                    icon: isPaid ? Icons.payment : Icons.upgrade,
                    onPressed: () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      shape: const RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.vertical(top: Radius.circular(20))),
                      builder: (_) => Padding(
                        padding: EdgeInsets.fromLTRB(16, 16, 16,
                            MediaQuery.of(context).viewInsets.bottom + 16),
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text('Submit Manual Payment Reference',
                                  style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 16),
                              TextField(
                                  controller: _refCtrl,
                                  decoration: const InputDecoration(
                                      labelText: 'MTN MoMo Reference',
                                      border: OutlineInputBorder(),
                                      prefixIcon: Icon(Icons.receipt))),
                              const SizedBox(height: 12),
                              TextField(
                                  controller: _phoneCtrl,
                                  keyboardType: TextInputType.phone,
                                  decoration: const InputDecoration(
                                      labelText: 'Phone used to pay',
                                      border: OutlineInputBorder(),
                                      prefixIcon: Icon(Icons.phone))),
                              const SizedBox(height: 20),
                              AppButton(
                                  label: 'Submit Reference for Verification',
                                  onPressed: _submitPayment,
                                  isLoading: _submitting),
                            ]),
                      ),
                    ),
                  ),
                ]),
    );
  }
}
