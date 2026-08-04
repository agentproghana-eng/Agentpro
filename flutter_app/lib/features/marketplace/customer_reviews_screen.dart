import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../shared/widgets/app_widgets.dart';

class CustomerReviewsScreen extends StatefulWidget {
  const CustomerReviewsScreen({super.key});

  @override
  State<CustomerReviewsScreen> createState() => _CustomerReviewsScreenState();
}

class _CustomerReviewsScreenState extends State<CustomerReviewsScreen> {
  List<Map<String, dynamic>> _reviews = [];
  List<Map<String, dynamic>> _ads = [];

  bool _loading = true;
  String? _error;
  String? _selectedAdId;
  int? _selectedRating;

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
      final response = await ApiClient.instance.get(
        '/marketplace/reviews/received',
        queryParameters: {
          if (_selectedAdId != null) 'ad_id': _selectedAdId,
          if (_selectedRating != null) 'rating': _selectedRating,
          'limit': 100,
        },
      );

      final rawReviews = response.data['data'];
      final rawAds = response.data['filters']?['ads'];

      if (!mounted) return;

      setState(() {
        _reviews = rawReviews is List
            ? rawReviews
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];

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
        _error =
            e.response?.data?['message'] ?? 'Customer reviews could not load.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Customer reviews could not load.';
        _loading = false;
      });
    }
  }

  void _clearFilters() {
    setState(() {
      _selectedAdId = null;
      _selectedRating = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters = _selectedAdId != null || _selectedRating != null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customer Reviews'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            _buildFilters(hasFilters),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              EmptyState(
                icon: Icons.error_outline,
                title: 'Could not load reviews',
                subtitle: _error,
                actionLabel: 'Retry',
                onAction: _load,
              )
            else if (_reviews.isEmpty)
              EmptyState(
                icon: Icons.rate_review_outlined,
                title: hasFilters ? 'No matching reviews' : 'No reviews yet',
                subtitle: hasFilters
                    ? 'Try changing or clearing the filters.'
                    : 'Reviews from customers will appear here.',
                actionLabel: hasFilters ? 'Clear Filters' : null,
                onAction: hasFilters ? _clearFilters : null,
              )
            else ...[
              Text(
                '${_reviews.length} review${_reviews.length == 1 ? '' : 's'}',
                style: TextStyle(
                  color:
                      Theme.of(context).colorScheme.onSurface.withOpacity(0.65),
                ),
              ),
              const SizedBox(height: 8),
              ..._reviews.map(_ReviewCard.new),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFilters(bool hasFilters) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.filter_list, size: 20),
                SizedBox(width: 8),
                Text(
                  'Filter Reviews',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              value: _selectedAdId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Advertisement',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All advertisements'),
                ),
                ..._ads.map(
                  (ad) => DropdownMenuItem<String?>(
                    value: ad['id']?.toString(),
                    child: Text(
                      '${ad['title'] ?? 'Untitled'} '
                      '(${ad['review_count'] ?? 0})',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
              onChanged: (value) {
                setState(() => _selectedAdId = value);
                _load();
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int?>(
              value: _selectedRating,
              decoration: const InputDecoration(
                labelText: 'Rating',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem<int?>(
                  value: null,
                  child: Text('All ratings'),
                ),
                for (var rating = 5; rating >= 1; rating--)
                  DropdownMenuItem<int?>(
                    value: rating,
                    child: Text(
                      '$rating star${rating == 1 ? '' : 's'}',
                    ),
                  ),
              ],
              onChanged: (value) {
                setState(() => _selectedRating = value);
                _load();
              },
            ),
            if (hasFilters) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _clearFilters,
                  icon: const Icon(Icons.clear),
                  label: const Text('Clear Filters'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  final Map<String, dynamic> review;

  const _ReviewCard(this.review);

  @override
  Widget build(BuildContext context) {
    final rating = int.tryParse(review['rating']?.toString() ?? '') ?? 0;

    final firstName = review['reviewer_first_name']?.toString().trim() ?? '';
    final lastName = review['reviewer_last_name']?.toString().trim() ?? '';
    final reviewerName = '$firstName $lastName'.trim();
    final displayName = reviewerName.isEmpty ? 'Customer' : reviewerName;

    final reviewText = review['review']?.toString().trim();
    final profileImage = review['reviewer_profile_image_url']?.toString();

    final createdAt = DateTime.tryParse(review['created_at']?.toString() ?? '');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundImage:
                      profileImage != null && profileImage.isNotEmpty
                          ? NetworkImage(profileImage)
                          : null,
                  child: profileImage == null || profileImage.isEmpty
                      ? Text(
                          displayName.characters.first.toUpperCase(),
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        review['ad_title']?.toString() ?? 'Advertisement',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withOpacity(0.65),
                        ),
                      ),
                    ],
                  ),
                ),
                if (createdAt != null)
                  Text(
                    DateFormat('MMM d, y').format(createdAt.toLocal()),
                    style: TextStyle(
                      fontSize: 11,
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withOpacity(0.55),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: List.generate(
                5,
                (index) => Icon(
                  index < rating ? Icons.star : Icons.star_border,
                  size: 18,
                  color: const Color(0xFFFFB300),
                ),
              ),
            ),
            if (reviewText != null && reviewText.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(reviewText),
            ] else ...[
              const SizedBox(height: 8),
              Text(
                'No written review.',
                style: TextStyle(
                  fontStyle: FontStyle.italic,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.55),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
