import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/theme/app_colors.dart';

class MyAdsScreen extends StatefulWidget {
  const MyAdsScreen({super.key});

  @override
  State<MyAdsScreen> createState() => _MyAdsScreenState();
}

class _MyAdsScreenState extends State<MyAdsScreen> {
  final ScrollController _scrollController = ScrollController();

  List<dynamic> _ads = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = false;
  String? _nextCursor;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_hasMore || _loading || _loadingMore) return;

    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      _load(loadMore: true);
    }
  }

  Future<void> _load({bool loadMore = false}) async {
    if (loadMore) {
      if (_loadingMore || !_hasMore || _nextCursor == null) return;

      setState(() => _loadingMore = true);
    } else {
      setState(() {
        _loading = true;
        _error = null;
        _nextCursor = null;
        _hasMore = false;
      });
    }

    try {
      final res = await ApiClient.instance.get(
        '/marketplace/mine/cursor',
        queryParameters: {
          'limit': 20,
          if (loadMore && _nextCursor != null) 'cursor': _nextCursor,
        },
      );

      final rawAds = res.data['data'];
      final pagination = res.data['pagination'];

      final incoming = rawAds is List ? rawAds : <dynamic>[];

      if (!mounted) return;

      setState(() {
        if (loadMore) {
          _ads.addAll(incoming);
        } else {
          _ads = List<dynamic>.from(incoming);
        }

        _nextCursor = pagination?['next_cursor']?.toString();
        _hasMore = pagination?['has_more'] == true;

        _loading = false;
        _loadingMore = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        if (!loadMore) {
          _error =
              e.response?.data?['message'] ?? 'Failed to load your ads';
        }

        _loading = false;
        _loadingMore = false;
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
                      subtitle:
                          'Post your first ad to reach customers on AgentPro.',
                      actionLabel: 'Post an Ad',
                      onAction: () => context.push('/marketplace/post'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(8),
                        itemCount:
                            _ads.length + (_loadingMore ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (i >= _ads.length) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Center(
                                child: CircularProgressIndicator(),
                              ),
                            );
                          }

                          final ad = _ads[i] as Map<String, dynamic>;
                          final price = ad['price'] != null
                              ? double.tryParse(ad['price'].toString())
                              : null;
                          final status = ad['status'] as String? ?? '';
                          final needsAction =
                              status == 'pending_payment';

                          return Card(
                            margin: const EdgeInsets.only(bottom: 6),
                            color: needsAction
                                ? AppTheme.secondaryColor
                                    .withValues(alpha: 0.05)
                                : null,
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: needsAction
                                    ? AppTheme.secondaryColor
                                        .withValues(alpha: 0.2)
                                    : AppTheme.primaryColor
                                        .withValues(alpha: 0.08),
                                child: Icon(
                                  needsAction
                                      ? Icons.payment
                                      : Icons.storefront_outlined,
                                  color: needsAction
                                      ? AppTheme.secondaryColor
                                      : AppTheme.primaryColor,
                                  size: 20,
                                ),
                              ),
                              title: Text(
                                ad['title'] ?? '',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  if (price != null)
                                    GhsAmount(
                                      amount: price,
                                      fontSize: 12,
                                    )
                                  else
                                    Text(
                                      'Contact for price',
                                      style: TextStyle(
                                        color:
                                            context.appSecondaryText,
                                        fontSize: 12,
                                      ),
                                    ),
                                  if (status == 'active') ...[
                                    const SizedBox(height: 2),
                                    Row(
                                      children: [
                                        Icon(
                                          Icons.visibility_outlined,
                                          size: 12,
                                          color:
                                              context.appSecondaryText,
                                        ),
                                        const SizedBox(width: 3),
                                        Text(
                                          '${ad['views_count'] ?? 0} '
                                          'view${(ad['views_count'] ?? 0) == 1 ? '' : 's'}',
                                          style: TextStyle(
                                            color: context
                                                .appSecondaryText,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                  if (needsAction)
                                    const Text(
                                      'Action needed: submit payment',
                                      style: TextStyle(
                                        color: AppTheme.warningColor,
                                        fontSize: 11,
                                        fontWeight:
                                            FontWeight.w600,
                                      ),
                                    ),
                                ],
                              ),
                              isThreeLine: needsAction,
                              trailing: StatusBadge(status: status),
                              onTap: () => context.push(
                                '/marketplace/ads/${ad['id']}',
                              ),
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
