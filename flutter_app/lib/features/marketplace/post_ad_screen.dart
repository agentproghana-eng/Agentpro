import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

/// Create a new Business Hub advertisement.
///
/// This only creates the ad record (status: pending_review). Publishing
/// requires two further steps the user does afterward, from the "My Ads"
/// screen: a superuser must approve it for payment, then the user submits
/// a MoMo payment reference, then a superuser verifies that payment and
/// publishes it. This screen's job ends at successful submission.
class PostAdScreen extends StatefulWidget {
  const PostAdScreen({super.key});

  @override
  State<PostAdScreen> createState() => _PostAdScreenState();
}

class _PostAdScreenState extends State<PostAdScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  List<dynamic> _categories = [];
  String? _categoryId;
  bool _loadingCategories = true;
  bool _submitting = false;
  double? _feePercent;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    try {
      final res = await ApiClient.instance.get('/marketplace/categories');
      if (mounted) {
        setState(() {
          _categories = res.data['data'] ?? [];
          _loadingCategories = false;
        });
      }
    } on DioException {
      if (mounted) setState(() => _loadingCategories = false);
    }
  }

  double get _estimatedFee {
    final price = double.tryParse(_priceCtrl.text.replaceAll(',', '')) ?? 0;
    // 1% is the documented default; the actual fee is calculated and
    // confirmed server-side from system_config, this is only a preview.
    return (price * 0.01 * 100).round() / 100;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);
    try {
      final res = await ApiClient.instance.post('/marketplace', data: {
        'title': _titleCtrl.text.trim(),
        'description': _descriptionCtrl.text.trim(),
        if (_priceCtrl.text.isNotEmpty)
          'price': double.tryParse(_priceCtrl.text.replaceAll(',', '')),
        'category_id': _categoryId,
        'location': _locationCtrl.text.trim(),
        'contact_phone': _phoneCtrl.text.trim(),
      });

      if (!mounted) return;
      final ad = res.data['data'];

      // Replace this screen with the ad's detail/payment screen rather than
      // just popping back to the marketplace, since the user's very next
      // step is almost always to track this ad's review status.
      context.pushReplacement('/marketplace/ads/${ad['id']}');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to submit ad. Please try again.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post an Ad')),
      body: _loadingCategories
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
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
                            'Ads are reviewed before going live. Once approved, '
                            'you\'ll pay a small publishing fee via MTN MoMo to '
                            'publish for 30 days.',
                            style: TextStyle(fontSize: 12, color: Colors.blue),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  AppTextField(
                    controller: _titleCtrl,
                    label: 'Ad Title',
                    hint: 'e.g. iPhone 13 Pro Max, Excellent Condition',
                    prefixIcon: Icons.title,
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Title is required' : null,
                  ),
                  const SizedBox(height: 14),

                  AppTextField(
                    controller: _descriptionCtrl,
                    label: 'Description',
                    hint: 'Describe what you\'re offering...',
                    maxLines: 5,
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Description is required' : null,
                  ),
                  const SizedBox(height: 14),

                  if (_categories.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      value: _categoryId,
                      decoration: InputDecoration(
                        labelText: 'Category',
                        prefixIcon: const Icon(Icons.category_outlined),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      items: _categories.map<DropdownMenuItem<String>>((c) => DropdownMenuItem(
                        value: c['id'] as String,
                        child: Text(c['name'] as String),
                      )).toList(),
                      onChanged: (v) => setState(() => _categoryId = v),
                      validator: (v) => v == null ? 'Please select a category' : null,
                    ),
                    const SizedBox(height: 14),
                  ],

                  TextFormField(
                    controller: _priceCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    onChanged: (_) => setState(() {}), // refresh fee preview
                    decoration: InputDecoration(
                      labelText: 'Price (optional)',
                      hintText: '0.00',
                      prefixIcon: const Icon(Icons.sell_outlined),
                      prefixText: 'GH₵  ',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      helperText: _priceCtrl.text.isNotEmpty
                          ? 'Estimated publishing fee: GH₵ ${_estimatedFee.toStringAsFixed(2)} (1% of price)'
                          : 'Leave blank for "Contact for price" listings — no fee applies',
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 14),

                  AppTextField(
                    controller: _locationCtrl,
                    label: 'Location',
                    hint: 'e.g. Accra, Greater Accra',
                    prefixIcon: Icons.location_on_outlined,
                  ),
                  const SizedBox(height: 14),

                  AppTextField(
                    controller: _phoneCtrl,
                    label: 'Contact Phone',
                    keyboardType: TextInputType.phone,
                    prefixIcon: Icons.phone_outlined,
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Contact phone is required' : null,
                  ),
                  const SizedBox(height: 24),

                  AppButton(
                    label: 'Submit for Review',
                    icon: Icons.send_outlined,
                    onPressed: _submit,
                    isLoading: _submitting,
                  ),
                ],
              ),
            ),
    );
  }

  @override
  void dispose() {
    for (final c in [_titleCtrl, _descriptionCtrl, _priceCtrl, _locationCtrl, _phoneCtrl]) {
      c.dispose();
    }
    super.dispose();
  }
}
