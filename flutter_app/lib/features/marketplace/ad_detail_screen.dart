import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_network_image.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/theme/app_colors.dart';
import 'marketplace_data_utils.dart';

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
  bool _isSaved = false;
  bool _updatingSaved = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final responses = await Future.wait([
        ApiClient.instance.get('/marketplace/${widget.adId}'),
        ApiClient.instance.get(
          '/marketplace/${widget.adId}/saved-status',
        ),
      ]);

      final res = responses[0];
      final savedStatus = responses[1];
      if (mounted) {
        setState(() {
          _ad = res.data['data'];
          _isSaved = savedStatus.data['data']?['is_saved'] == true;
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

  Future<void> _toggleSaved() async {
    if (_updatingSaved) return;

    final previousValue = _isSaved;

    setState(() {
      _isSaved = !previousValue;
      _updatingSaved = true;
    });

    try {
      if (previousValue) {
        await ApiClient.instance.delete(
          '/marketplace/${widget.adId}/save',
        );
      } else {
        await ApiClient.instance.post(
          '/marketplace/${widget.adId}/save',
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() => _isSaved = previousValue);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.response?.data?['message'] ??
                'Failed to update saved advertisement.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingSaved = false);
      }
    }
  }

  void _openGallery(
    List<String> images, {
    int initialIndex = 0,
  }) {
    if (images.isEmpty) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _FullScreenGallery(
          images: images,
          initialIndex: initialIndex,
        ),
      ),
    );
  }

  Future<void> _messageSeller() async {
    final conversationId = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _MarketplaceEnquirySheet(
        adId: widget.adId,
        itemTitle: _ad?['title']?.toString() ?? 'this item',
      ),
    );

    if (!mounted || conversationId == null || conversationId.isEmpty) {
      return;
    }

    context.push(
      '/marketplace/enquiries/$conversationId',
    );
  }

  void _showPaymentSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
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
      appBar: AppBar(
        title: Text(
          _ad?['is_owner'] == true ? 'Ad Status' : 'Item Details',
        ),
        actions: [
          if (!_loading && _error == null && _ad?['is_owner'] != true)
            IconButton(
              tooltip: _isSaved ? 'Remove from saved' : 'Save ad',
              onPressed: _updatingSaved ? null : _toggleSaved,
              icon: _updatingSaved
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : Icon(
                      _isSaved ? Icons.favorite : Icons.favorite_border,
                    ),
            ),
        ],
      ),
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
    final status = ad['status']?.toString() ?? '';
    final isOwner = ad['is_owner'] == true;

    final price =
        ad['price'] == null ? null : double.tryParse(ad['price'].toString());

    final fee = double.tryParse(ad['publishing_fee']?.toString() ?? '0') ?? 0;

    final images = normalizedMarketplaceImageUrls(
      ad['image_urls'],
    );

    final rating = double.tryParse(ad['avg_rating']?.toString() ?? '0') ?? 0;

    final ratingCount =
        int.tryParse(ad['rating_count']?.toString() ?? '0') ?? 0;

    final sellerRating = double.tryParse(
          ad['seller_average_rating']?.toString() ?? '0',
        ) ??
        0;

    final sellerReviewCount = int.tryParse(
          ad['seller_review_count']?.toString() ?? '0',
        ) ??
        0;

    final firstName = ad['seller_first_name']?.toString().trim() ?? '';

    final lastName = ad['seller_last_name']?.toString().trim() ?? '';

    final sellerName = [
      firstName,
      lastName,
    ].where((part) => part.isNotEmpty).join(' ');

    final companyName = ad['company_name']?.toString().trim() ?? '';

    final sellerId = ad['seller_id']?.toString();

    final sellerImage = ad['seller_profile_image_url']?.toString().trim();

    final companyLogo = ad['company_logo_url']?.toString().trim();

    final sellerImageUrl = sellerImage != null && sellerImage.isNotEmpty
        ? sellerImage
        : companyLogo != null && companyLogo.isNotEmpty
            ? companyLogo
            : null;

    final isVerified = ad['is_verified'] == true;

    final description = ad['description']?.toString().trim() ?? '';

    final location = ad['location']?.toString().trim() ?? '';

    final contactPhone = ad['contact_phone']?.toString().trim() ?? '';

    final publishedAt = parseMarketplaceDateTime(
      ad['published_at'],
    );

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          if (images.isNotEmpty) ...[
            _DetailImageGallery(
              images: images,
              onOpenGallery: (index) => _openGallery(
                images,
                initialIndex: index,
              ),
            ),
            const SizedBox(height: 16),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          ad['title']?.toString() ?? '',
                          style: const TextStyle(
                            fontSize: 21,
                            height: 1.2,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      if (isOwner) ...[
                        const SizedBox(width: 10),
                        StatusBadge(status: status),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    price != null && price > 0
                        ? 'GH₵ ${price.toStringAsFixed(2)}'
                        : 'Contact for price',
                    style: TextStyle(
                      color: context.isDarkMode
                          ? AppTheme.primaryLight
                          : AppTheme.primaryColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 22,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 14,
                    runSpacing: 8,
                    children: [
                      _DetailMeta(
                        icon: ratingCount > 0 ? Icons.star : Icons.star_border,
                        iconColor: const Color(0xFFFFB300),
                        text: ratingCount > 0
                            ? '${rating.toStringAsFixed(1)} '
                                '($ratingCount review'
                                '${ratingCount == 1 ? '' : 's'})'
                            : 'New · No reviews yet',
                      ),
                      if (location.isNotEmpty)
                        _DetailMeta(
                          icon: Icons.location_on_outlined,
                          text: location,
                        ),
                    ],
                  ),
                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Divider(
                      color: Theme.of(context)
                          .dividerColor
                          .withValues(alpha: 0.55),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      description,
                      style: TextStyle(
                        color: context.appPrimaryText,
                        height: 1.5,
                      ),
                    ),
                  ],
                  if (contactPhone.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _DetailMeta(
                      icon: Icons.phone_outlined,
                      text: contactPhone,
                    ),
                  ],
                  if (publishedAt != null) ...[
                    const SizedBox(height: 8),
                    _DetailMeta(
                      icon: Icons.calendar_today_outlined,
                      text: 'Published ${DateFormat('MMM d, y').format(
                        publishedAt.toLocal(),
                      )}',
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (!isOwner &&
              (sellerName.isNotEmpty || companyName.isNotEmpty)) ...[
            const SizedBox(height: 14),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        ClipOval(
                          child: SizedBox(
                            width: 48,
                            height: 48,
                            child: sellerImageUrl == null
                                ? Container(
                                    color: AppTheme.primaryColor
                                        .withValues(alpha: 0.12),
                                    child: const Icon(
                                      Icons.person_outline,
                                    ),
                                  )
                                : AppNetworkImage(
                                    url: sellerImageUrl,
                                    fit: BoxFit.cover,
                                    memCacheWidth: 180,
                                    errorWidget: Container(
                                      color: AppTheme.primaryColor
                                          .withValues(alpha: 0.12),
                                      child: const Icon(
                                        Icons.person_outline,
                                      ),
                                    ),
                                  ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (sellerName.isNotEmpty)
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        sellerName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    if (isVerified) ...[
                                      const SizedBox(width: 4),
                                      const Icon(
                                        Icons.verified,
                                        size: 16,
                                        color: Colors.blue,
                                      ),
                                    ],
                                  ],
                                ),
                              if (companyName.isNotEmpty) ...[
                                if (sellerName.isNotEmpty)
                                  const SizedBox(height: 2),
                                Text(
                                  companyName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: context.appSecondaryText,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(
                                    sellerReviewCount > 0
                                        ? Icons.star
                                        : Icons.star_border,
                                    size: 13,
                                    color: const Color(0xFFFFB300),
                                  ),
                                  const SizedBox(width: 3),
                                  Text(
                                    sellerReviewCount > 0
                                        ? '${sellerRating.toStringAsFixed(1)} '
                                            'seller · '
                                            '$sellerReviewCount review'
                                            '${sellerReviewCount == 1 ? '' : 's'}'
                                        : 'New seller · No reviews yet',
                                    style: TextStyle(
                                      color: context.appSecondaryText,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (sellerId != null && sellerId.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => context.push(
                          '/marketplace/sellers/$sellerId',
                        ),
                        icon: const Icon(
                          Icons.storefront_outlined,
                          size: 18,
                        ),
                        label: const Text('View Seller Profile'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          if (!isOwner && status == 'active') ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _messageSeller,
                    icon: const Icon(
                      Icons.chat_bubble_outline,
                    ),
                    label: const Text('Message Seller'),
                  ),
                ),
                if (images.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _openGallery(images),
                      icon: const Icon(
                        Icons.photo_library_outlined,
                      ),
                      label: const Text('View Photos'),
                    ),
                  ),
                ],
              ],
            ),
          ],
          if (isOwner) ...[
            const SizedBox(height: 16),
            _StatusExplainer(
              status: status,
              fee: fee,
              expiresAt: ad['expires_at']?.toString(),
              rejectionReason: ad['rejection_reason']?.toString(),
            ),
            if (status == 'pending_payment') ...[
              const SizedBox(height: 20),
              AppButton(
                label: 'Pay GH₵ ${fee.toStringAsFixed(2)} & Submit Reference',
                icon: Icons.payment,
                onPressed: _showPaymentSheet,
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _DetailMeta extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color? iconColor;

  const _DetailMeta({
    required this.icon,
    required this.text,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 15,
          color: iconColor ?? context.appSecondaryText.withValues(alpha: 0.84),
        ),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            text,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailImageGallery extends StatefulWidget {
  final List<String> images;
  final ValueChanged<int> onOpenGallery;

  const _DetailImageGallery({
    required this.images,
    required this.onOpenGallery,
  });

  @override
  State<_DetailImageGallery> createState() => _DetailImageGalleryState();
}

class _DetailImageGalleryState extends State<_DetailImageGallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 310,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            PageView.builder(
              itemCount: widget.images.length,
              onPageChanged: (index) {
                setState(() => _index = index);
              },
              itemBuilder: (context, index) {
                return GestureDetector(
                  onTap: () => widget.onOpenGallery(index),
                  child: Container(
                    color: AppTheme.primaryColor.withValues(
                      alpha: 0.08,
                    ),
                    alignment: Alignment.center,
                    child: AppNetworkImage(
                      url: widget.images[index],
                      fit: BoxFit.contain,
                      memCacheWidth: 1400,
                      errorWidget: Center(
                        child: Icon(
                          Icons.broken_image_outlined,
                          size: 44,
                          color: context.appSecondaryText,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
            if (widget.images.length > 1)
              Positioned(
                right: 10,
                bottom: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(
                      alpha: 0.68,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${_index + 1}/${widget.images.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            Positioned(
              left: 10,
              bottom: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(
                    alpha: 0.68,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.fullscreen,
                      color: Colors.white,
                      size: 14,
                    ),
                    SizedBox(width: 3),
                    Text(
                      'View full photo',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FullScreenGallery extends StatefulWidget {
  final List<String> images;
  final int initialIndex;

  const _FullScreenGallery({
    required this.images,
    required this.initialIndex,
  });

  @override
  State<_FullScreenGallery> createState() => _FullScreenGalleryState();
}

class _FullScreenGalleryState extends State<_FullScreenGallery> {
  late final PageController _pageController;
  late int _index;

  @override
  void initState() {
    super.initState();

    final maximumIndex = widget.images.isEmpty ? 0 : widget.images.length - 1;

    _index = widget.initialIndex.clamp(
      0,
      maximumIndex,
    );

    _pageController = PageController(
      initialPage: _index,
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _jumpTo(int index) {
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              itemCount: widget.images.length,
              onPageChanged: (index) {
                setState(() => _index = index);
              },
              itemBuilder: (context, index) {
                return _ZoomableGalleryImage(
                  url: widget.images[index],
                );
              },
            ),
            Positioned(
              top: 8,
              left: 8,
              child: IconButton.filled(
                tooltip: 'Close',
                onPressed: () => Navigator.pop(context),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.black.withValues(alpha: 0.55),
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.close),
              ),
            ),
            if (widget.images.length > 1)
              Positioned(
                top: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(
                      alpha: 0.62,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${_index + 1}/${widget.images.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            if (widget.images.length > 1)
              Positioned(
                left: 0,
                right: 0,
                bottom: 16,
                child: SizedBox(
                  height: 62,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                    ),
                    scrollDirection: Axis.horizontal,
                    itemCount: widget.images.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final selected = index == _index;

                      return GestureDetector(
                        onTap: () => _jumpTo(index),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 160),
                          width: 58,
                          height: 58,
                          padding: EdgeInsets.all(
                            selected ? 2 : 0,
                          ),
                          decoration: BoxDecoration(
                            border: selected
                                ? Border.all(
                                    color: AppTheme.secondaryColor,
                                    width: 2,
                                  )
                                : null,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(7),
                            child: AppNetworkImage(
                              url: widget.images[index],
                              fit: BoxFit.cover,
                              memCacheWidth: 180,
                              errorWidget: const ColoredBox(
                                color: Colors.black45,
                                child: Icon(
                                  Icons.broken_image_outlined,
                                  color: Colors.white70,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ZoomableGalleryImage extends StatefulWidget {
  final String url;

  const _ZoomableGalleryImage({
    required this.url,
  });

  @override
  State<_ZoomableGalleryImage> createState() => _ZoomableGalleryImageState();
}

class _ZoomableGalleryImageState extends State<_ZoomableGalleryImage> {
  final TransformationController _controller = TransformationController();

  bool _zoomed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _toggleZoom() {
    setState(() {
      _zoomed = !_zoomed;

      _controller.value =
          _zoomed ? Matrix4.diagonal3Values(2.5, 2.5, 1) : Matrix4.identity();
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTap: _toggleZoom,
      child: InteractiveViewer(
        transformationController: _controller,
        minScale: 1,
        maxScale: 4,
        child: Center(
          child: AppNetworkImage(
            url: widget.url,
            fit: BoxFit.contain,
            memCacheWidth: 1800,
            errorWidget: const Center(
              child: Icon(
                Icons.broken_image_outlined,
                size: 52,
                color: Colors.white70,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MarketplaceEnquirySheet extends StatefulWidget {
  final String adId;
  final String itemTitle;

  const _MarketplaceEnquirySheet({
    required this.adId,
    required this.itemTitle,
  });

  @override
  State<_MarketplaceEnquirySheet> createState() =>
      _MarketplaceEnquirySheetState();
}

class _MarketplaceEnquirySheetState extends State<_MarketplaceEnquirySheet> {
  final _messageController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final message = _messageController.text.trim();

    if (message.isEmpty) {
      setState(() {
        _error = 'Enter a message for the seller.';
      });
      return;
    }

    if (message.length > 2000) {
      setState(() {
        _error = 'Message must not exceed 2000 characters.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.post(
        '/marketplace/${widget.adId}/enquiries',
        data: {'message': message},
      );

      final conversationId =
          response.data?['data']?['conversation']?['id']?.toString();

      if (!mounted) return;

      if (conversationId == null || conversationId.isEmpty) {
        setState(() {
          _submitting = false;
          _error =
              'Your message was sent, but the conversation could not be opened.';
        });
        return;
      }

      Navigator.pop(context, conversationId);
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _submitting = false;
        _error = e.response?.data?['message']?.toString() ??
            'Could not message the seller.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Message Seller',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                widget.itemTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.appSecondaryText,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _messageController,
                minLines: 4,
                maxLines: 7,
                maxLength: 2000,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Your message',
                  hintText:
                      'Ask about availability, condition, delivery or pickup.',
                  errorText: _error,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(
                        Icons.send_outlined,
                      ),
                label: Text(
                  _submitting ? 'Sending...' : 'Send Message',
                ),
              ),
            ],
          ),
        ),
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
    final expiresAtDate = parseMarketplaceDateTime(expiresAt);

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
          expiresAtDate != null
              ? 'Your ad is published and visible to all users until '
                  '${DateFormat('dd MMM yyyy').format(expiresAtDate)}.'
              : 'Your ad is published and visible to all users.',
        ),
      'rejected' => (
          Icons.cancel,
          AppTheme.errorColor,
          'Not Approved',
          rejectionReason ??
              'This ad did not meet our content guidelines. '
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
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(title,
                style: TextStyle(fontWeight: FontWeight.bold, color: color)),
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

  const _AdPaymentSheet(
      {required this.adId, required this.fee, required this.onSubmitted});

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
      await ApiClient.instance
          .post('/marketplace/${widget.adId}/payment', data: {
        'momo_reference': _refCtrl.text.trim(),
        'payment_phone': _phoneCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Payment reference submitted. Awaiting verification.')));
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
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Submit Payment Reference',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
              'Pay GH₵ ${widget.fee.toStringAsFixed(2)} via MTN MoMo, then enter your reference below.',
              style: TextStyle(color: context.appSecondaryText, fontSize: 13)),
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
              label: 'Submit Reference',
              onPressed: _submit,
              isLoading: _submitting),
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
