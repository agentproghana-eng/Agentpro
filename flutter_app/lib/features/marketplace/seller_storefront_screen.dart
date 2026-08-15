import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_network_image.dart';
import '../../shared/widgets/app_widgets.dart';
import 'marketplace_data_utils.dart';

class SellerStorefrontScreen extends StatefulWidget {
  final String sellerId;

  const SellerStorefrontScreen({
    super.key,
    required this.sellerId,
  });

  @override
  State<SellerStorefrontScreen> createState() => _SellerStorefrontScreenState();
}

class _SellerStorefrontScreenState extends State<SellerStorefrontScreen> {
  Map<String, dynamic>? _seller;
  List<Map<String, dynamic>> _ads = [];

  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final response = await ApiClient.instance.get(
        '/marketplace/sellers/${widget.sellerId}',
      );

      final rawData = response.data['data'];
      final rawSeller = rawData?['seller'];
      final rawAds = rawData?['advertisements'];

      if (!mounted) return;

      setState(() {
        _seller =
            rawSeller is Map ? Map<String, dynamic>.from(rawSeller) : null;

        _ads = rawAds is List
            ? rawAds
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];

        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.response?.data?['message'] ??
            'Seller storefront could not be loaded.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Seller storefront could not be loaded.';
        _loading = false;
      });
    }
  }

  String get _sellerName {
    final firstName = _seller?['first_name']?.toString() ?? '';
    final lastName = _seller?['last_name']?.toString() ?? '';

    return '$firstName $lastName'.trim();
  }

  String get _companyName =>
      _seller?['company_name']?.toString().trim() ?? '';

  String get _displayName {
    if (_sellerName.isNotEmpty) {
      return _sellerName;
    }

    if (_companyName.isNotEmpty) {
      return _companyName;
    }

    return 'Marketplace Seller';
  }

  String? get _imageUrl {
    final profileImage = _seller?['profile_image_url']?.toString().trim();

    if (profileImage != null && profileImage.isNotEmpty) {
      return profileImage;
    }

    final companyLogo = _seller?['company_logo_url']?.toString().trim();

    if (companyLogo != null && companyLogo.isNotEmpty) {
      return companyLogo;
    }

    return null;
  }

  int _asInt(String key) {
    final value = _seller?[key];

    if (value is int) return value;
    if (value is num) return value.toInt();

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  double _asDouble(String key) {
    final value = _seller?[key];

    if (value is double) return value;
    if (value is num) return value.toDouble();

    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Seller Storefront'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.storefront_outlined,
                  title: 'Could not load storefront',
                  subtitle: _error,
                  actionLabel: 'Try Again',
                  onAction: _load,
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: CustomScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverToBoxAdapter(
                        child: _buildSellerHeader(),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(
                            16,
                            22,
                            16,
                            12,
                          ),
                          child: Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Advertisements',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              Text(
                                '${_ads.length} active',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (_ads.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: Center(
                            child: Padding(
                              padding: EdgeInsets.all(24),
                              child: Text(
                                'This seller has no active advertisements.',
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(
                            12,
                            0,
                            12,
                            32,
                          ),
                          sliver: SliverGrid(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                return _StorefrontAdCard(
                                  ad: _ads[index],
                                );
                              },
                              childCount: _ads.length,
                            ),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: 0.76,
                              crossAxisSpacing: 10,
                              mainAxisSpacing: 10,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }

  Widget _buildSellerHeader() {
    final rating = _asDouble('average_rating');
    final reviewCount = _asInt('review_count');
    final activeAdCount = _asInt('active_ad_count');
    final isVerified = _seller?['is_verified'] == true;
    final isFeatured = _seller?['is_featured'] == true;

    final location = _seller?['company_address']?.toString();
    final phone =
        _seller?['company_phone']?.toString().trim().isNotEmpty == true
            ? _seller!['company_phone'].toString()
            : _seller?['seller_phone']?.toString();

    final email =
        _seller?['company_email']?.toString().trim().isNotEmpty == true
            ? _seller!['company_email'].toString()
            : _seller?['seller_email']?.toString();

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            CircleAvatar(
              radius: 42,
              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.12),
              backgroundImage:
                  _imageUrl == null ? null : NetworkImage(_imageUrl!),
              child: _imageUrl == null
                  ? const Icon(
                      Icons.storefront,
                      size: 38,
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    _displayName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (isVerified) ...[
                  const SizedBox(width: 5),
                  const Tooltip(
                    message: 'Verified Business',
                    child: Icon(
                      Icons.verified,
                      size: 21,
                      color: Colors.blue,
                    ),
                  ),
                ],
              ],
            ),
            if (_sellerName.isNotEmpty && _companyName.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                _companyName,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (isVerified || isFeatured) ...[
              const SizedBox(height: 7),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 7,
                runSpacing: 5,
                children: [
                  if (isVerified)
                    const Chip(
                      avatar: Icon(
                        Icons.verified,
                        size: 16,
                        color: Colors.blue,
                      ),
                      label: Text('Verified Business'),
                      visualDensity: VisualDensity.compact,
                    ),
                  if (isFeatured)
                    const Chip(
                      avatar: Icon(
                        Icons.star,
                        size: 16,
                        color: Color(0xFFFFB300),
                      ),
                      label: Text('Featured Seller'),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: _StoreStat(
                    value: activeAdCount.toString(),
                    label: 'Active Ads',
                  ),
                ),
                Expanded(
                  child: _StoreStat(
                    value: rating > 0 ? rating.toStringAsFixed(1) : '—',
                    label: 'Rating',
                    icon: rating > 0 ? Icons.star : null,
                  ),
                ),
                Expanded(
                  child: _StoreStat(
                    value: reviewCount.toString(),
                    label: 'Reviews',
                  ),
                ),
              ],
            ),
            if (location != null && location.trim().isNotEmpty) ...[
              const SizedBox(height: 18),
              _ContactRow(
                icon: Icons.location_on_outlined,
                text: location,
              ),
            ],
            if (phone != null && phone.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              _ContactRow(
                icon: Icons.phone_outlined,
                text: phone,
              ),
            ],
            if (email != null && email.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              _ContactRow(
                icon: Icons.email_outlined,
                text: email,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StoreStat extends StatelessWidget {
  final String value;
  final String label;
  final IconData? icon;

  const _StoreStat({
    required this.value,
    required this.label,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 15,
                color: const Color(0xFFFFB300),
              ),
              const SizedBox(width: 3),
            ],
            Text(
              value,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: context.appSecondaryText,
          ),
        ),
      ],
    );
  }
}

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _ContactRow({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          icon,
          size: 18,
          color: context.appSecondaryText,
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _StorefrontAdCard extends StatelessWidget {
  final Map<String, dynamic> ad;

  const _StorefrontAdCard({
    required this.ad,
  });

  @override
  Widget build(BuildContext context) {
    final images = normalizedMarketplaceImageUrls(
      ad['image_urls'],
    );

    final price = double.tryParse(ad['price']?.toString() ?? '0') ?? 0;

    final rating = double.tryParse(ad['avg_rating']?.toString() ?? '0') ?? 0;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/marketplace/ads/${ad['id']}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                width: double.infinity,
                color: AppTheme.primaryColor.withValues(alpha: 0.08),
                child: images.isNotEmpty
                    ? AppNetworkImage(
                        url: images.first,
                        fit: BoxFit.contain,
                        memCacheWidth: 700,
                        errorWidget: const Icon(
                          Icons.image_outlined,
                          size: 40,
                        ),
                      )
                    : const Icon(
                        Icons.image_outlined,
                        size: 40,
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(9),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (ad['category_name'] != null)
                    Text(
                      ad['category_name'].toString(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 9,
                        color: context.appSecondaryText,
                      ),
                    ),
                  Text(
                    ad['title']?.toString() ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (price > 0) ...[
                    const SizedBox(height: 3),
                    Text(
                      'GH₵ ${price.toStringAsFixed(2)}',
                      style: TextStyle(
                        color: context.isDarkMode
                            ? AppTheme.primaryLight
                            : AppTheme.primaryColor,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                  if (rating > 0) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(
                          Icons.star,
                          size: 12,
                          color: Color(0xFFFFB300),
                        ),
                        const SizedBox(width: 3),
                        Text(
                          rating.toStringAsFixed(1),
                          style: TextStyle(
                            fontSize: 10,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
