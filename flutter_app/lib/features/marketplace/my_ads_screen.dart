import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class MyAdsScreen extends StatefulWidget {
  const MyAdsScreen({super.key});

  @override
  State<MyAdsScreen> createState() => _MyAdsScreenState();
}

class _MyAdsScreenState extends State<MyAdsScreen> {
  List<dynamic> _ads = [];
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
      final res = await ApiClient.instance.get('/marketplace/mine');
      if (mounted) setState(() { _ads = res.data['data'] ?? []; _loading = false; });
    } on DioException catch (e) {
      if (mounted) setState(() {
        _error = e.response?.data?['message'] ?? 'Failed to load your ads';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Ads')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load your ads',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : _ads.isEmpty
                  ? EmptyState(
                      icon: Icons.storefront_outlined,
                      title: 'No ads yet',
                      subtitle: 'Post your first ad to reach customers on Agent Pro Ghana.',
                      actionLabel: 'Post an Ad',
                      onAction: () => context.push('/marketplace/post'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(8),
                        itemCount: _ads.length,
                        itemBuilder: (_, i) {
                          final ad = _ads[i] as Map<String, dynamic>;
                          final price = ad['price'] != null
                              ? double.tryParse(ad['price'].toString())
                              : null;
                          final status = ad['status'] as String? ?? '';
                          // Highlight ads that need the user to take action
                          final needsAction = status == 'pending_payment';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 6),
                            color: needsAction ? AppTheme.secondaryColor.withOpacity(0.05) : null,
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: needsAction
                                    ? AppTheme.secondaryColor.withOpacity(0.2)
                                    : AppTheme.primaryColor.withOpacity(0.08),
                                child: Icon(
                                  needsAction ? Icons.payment : Icons.storefront_outlined,
                                  color: needsAction ? AppTheme.secondaryColor : AppTheme.primaryColor,
                                  size: 20,
                                ),
                              ),
                              title: Text(
                                ad['title'] ?? '',
                                style: const TextStyle(fontWeight: FontWeight.w600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (price != null)
                                    GhsAmount(amount: price, fontSize: 12)
                                  else
                                    Text('Contact for price',
                                        style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                                  if (needsAction)
                                    const Text('Action needed: submit payment',
                                        style: TextStyle(
                                            color: AppTheme.warningColor,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600)),
                                ],
                              ),
                              isThreeLine: needsAction,
                              trailing: StatusBadge(status: status),
                              onTap: () => context.push('/marketplace/ads/${ad['id']}'),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/marketplace/post'),
        icon: const Icon(Icons.add),
        label: const Text('Post Ad'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: AppTheme.secondaryColor,
      ),
    );
  }
}
