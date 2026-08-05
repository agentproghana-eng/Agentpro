import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  List<Map<String, dynamic>> _ads = [];
  List<Map<String, dynamic>> _categories = [];

  final Set<String> _savedIds = <String>{};
  final Set<String> _updatingIds = <String>{};

  final _searchController = TextEditingController();
  final _locationController = TextEditingController();
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();

  bool _loading = true;
  String? _error;
  String? _selectedCategoryId;
  double? _minimumRating;
  String _sort = 'newest';

  static const Map<String, String> _sortLabels = {
    'newest': 'Newest',
    'oldest': 'Oldest',
    'most_viewed': 'Most Viewed',
    'highest_rated': 'Highest Rated',
    'price_low': 'Price: Low to High',
    'price_high': 'Price: High to Low',
  };

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  int get _activeFilterCount {
    var count = 0;

    if (_selectedCategoryId != null) count++;
    if (_locationController.text.trim().isNotEmpty) count++;
    if (_minPriceController.text.trim().isNotEmpty) count++;
    if (_maxPriceController.text.trim().isNotEmpty) count++;
    if (_minimumRating != null) count++;
    if (_sort != 'newest') count++;

    return count;
  }

  Future<void> _loadInitialData() async {
    await Future.wait([
      _loadCategories(),
      _load(),
    ]);
  }

  Future<void> _loadCategories() async {
    try {
      final response = await ApiClient.instance.get('/marketplace/categories');
      final raw = response.data['data'];

      if (!mounted) return;

      setState(() {
        _categories = raw is List
            ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];
      });
    } catch (_) {
      // Categories are useful but not critical enough to block ad browsing.
    }
  }

  Map<String, dynamic> _queryParameters() {
    final parameters = <String, dynamic>{
      'sort': _sort,
    };

    final search = _searchController.text.trim();
    final location = _locationController.text.trim();
    final minPrice = _minPriceController.text.trim();
    final maxPrice = _maxPriceController.text.trim();

    if (search.isNotEmpty) parameters['search'] = search;
    if (_selectedCategoryId != null) {
      parameters['category_id'] = _selectedCategoryId;
    }
    if (location.isNotEmpty) parameters['location'] = location;
    if (minPrice.isNotEmpty) parameters['min_price'] = minPrice;
    if (maxPrice.isNotEmpty) parameters['max_price'] = maxPrice;
    if (_minimumRating != null) {
      parameters['min_rating'] = _minimumRating;
    }

    return parameters;
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final responses = await Future.wait([
        ApiClient.instance.get(
          '/marketplace',
          queryParameters: _queryParameters(),
        ),
        ApiClient.instance.get('/marketplace/saved/ids'),
      ]);

      final rawAds = responses[0].data['data'];
      final rawSavedIds = responses[1].data['data'];

      if (!mounted) return;

      setState(() {
        _ads = rawAds is List
            ? rawAds
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];

        _savedIds
          ..clear()
          ..addAll(
            rawSavedIds is List
                ? rawSavedIds.map((id) => id.toString())
                : const <String>[],
          );

        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error =
            e.response?.data?['message'] ?? 'Failed to load advertisements.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load advertisements.';
        _loading = false;
      });
    }
  }

  Future<void> _toggleSaved(Map<String, dynamic> ad) async {
    final id = ad['id']?.toString();

    if (id == null || _updatingIds.contains(id)) return;

    final wasSaved = _savedIds.contains(id);

    setState(() {
      _updatingIds.add(id);

      if (wasSaved) {
        _savedIds.remove(id);
      } else {
        _savedIds.add(id);
      }
    });

    try {
      if (wasSaved) {
        await ApiClient.instance.delete('/marketplace/$id/save');
      } else {
        await ApiClient.instance.post('/marketplace/$id/save');
      }
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        if (wasSaved) {
          _savedIds.add(id);
        } else {
          _savedIds.remove(id);
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.response?.data?['message'] ??
                'Failed to update saved advertisement.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingIds.remove(id));
      }
    }
  }

  void _selectCategory(String? categoryId) {
    setState(() => _selectedCategoryId = categoryId);
    _load();
  }

  void _clearFilters() {
    setState(() {
      _selectedCategoryId = null;
      _minimumRating = null;
      _sort = 'newest';
      _locationController.clear();
      _minPriceController.clear();
      _maxPriceController.clear();
    });

    _load();
  }

  Future<void> _showFilters() async {
    String? draftCategoryId = _selectedCategoryId;
    double? draftRating = _minimumRating;
    String draftSort = _sort;

    final locationController = TextEditingController(
      text: _locationController.text,
    );
    final minPriceController = TextEditingController(
      text: _minPriceController.text,
    );
    final maxPriceController = TextEditingController(
      text: _maxPriceController.text,
    );

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
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
                        'Filter Advertisements',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 20),
                      DropdownButtonFormField<String?>(
                        initialValue: draftCategoryId,
                        decoration: const InputDecoration(
                          labelText: 'Category',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('All categories'),
                          ),
                          ..._categories.map(
                            (category) => DropdownMenuItem<String?>(
                              value: category['id']?.toString(),
                              child: Text(
                                category['name']?.toString() ?? '',
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) {
                          setSheetState(() => draftCategoryId = value);
                        },
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: locationController,
                        decoration: const InputDecoration(
                          labelText: 'Location',
                          hintText: 'e.g. Accra, Kumasi',
                          prefixIcon: Icon(Icons.location_on_outlined),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: minPriceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Minimum price',
                                prefixText: 'GH₵ ',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: maxPriceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Maximum price',
                                prefixText: 'GH₵ ',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'Minimum rating',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('Any'),
                            selected: draftRating == null,
                            onSelected: (_) {
                              setSheetState(() => draftRating = null);
                            },
                          ),
                          for (final rating in [3.0, 4.0, 4.5])
                            ChoiceChip(
                              label: Text('$rating+ ★'),
                              selected: draftRating == rating,
                              onSelected: (_) {
                                setSheetState(() => draftRating = rating);
                              },
                            ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      DropdownButtonFormField<String>(
                        initialValue: draftSort,
                        decoration: const InputDecoration(
                          labelText: 'Sort by',
                          border: OutlineInputBorder(),
                        ),
                        items: _sortLabels.entries
                            .map(
                              (entry) => DropdownMenuItem(
                                value: entry.key,
                                child: Text(entry.value),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value != null) {
                            setSheetState(() => draftSort = value);
                          }
                        },
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(sheetContext, true);
                        },
                        icon: const Icon(Icons.filter_alt),
                        label: const Text('Apply Filters'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (applied == true) {
      setState(() {
        _selectedCategoryId = draftCategoryId;
        _minimumRating = draftRating;
        _sort = draftSort;
        _locationController.text = locationController.text.trim();
        _minPriceController.text = minPriceController.text.trim();
        _maxPriceController.text = maxPriceController.text.trim();
      });

      await _load();
    }

    locationController.dispose();
    minPriceController.dispose();
    maxPriceController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Hub'),
        actions: [
          IconButton(
            tooltip: 'More',
            onPressed: () => context.push('/marketplace/more'),
            icon: const Icon(Icons.more_horiz),
          ),
          IconButton(
            tooltip: 'Saved Ads',
            onPressed: () async {
              await context.push('/marketplace/saved');
              if (mounted) _load();
            },
            icon: const Icon(Icons.favorite_outline),
          ),
          TextButton.icon(
            onPressed: () => context.push('/marketplace/mine'),
            icon: const Icon(
              Icons.person_outline,
              color: Colors.white,
              size: 18,
            ),
            label: const Text(
              'My Ads',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search products, services or locations',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                setState(() {});
                                _load();
                              },
                            ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0),
                      isDense: true,
                    ),
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _load(),
                  ),
                ),
                const SizedBox(width: 8),
                Badge(
                  isLabelVisible: _activeFilterCount > 0,
                  label: Text(_activeFilterCount.toString()),
                  child: IconButton.filledTonal(
                    tooltip: 'Filters',
                    onPressed: _showFilters,
                    icon: const Icon(Icons.tune),
                  ),
                ),
              ],
            ),
          ),
          if (_categories.isNotEmpty)
            SizedBox(
              height: 48,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: const Text('All'),
                      selected: _selectedCategoryId == null,
                      onSelected: (_) => _selectCategory(null),
                    ),
                  ),
                  ..._categories.map(
                    (category) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          category['name']?.toString() ?? '',
                        ),
                        selected:
                            _selectedCategoryId == category['id']?.toString(),
                        onSelected: (_) => _selectCategory(
                          category['id']?.toString(),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (_activeFilterCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '$_activeFilterCount filter'
                      '${_activeFilterCount == 1 ? '' : 's'} applied'
                      ' · ${_sortLabels[_sort]}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    onPressed: _clearFilters,
                    child: const Text('Clear all'),
                  ),
                ],
              ),
            ),
          Expanded(child: _buildResults()),
        ],
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

  Widget _buildResults() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return EmptyState(
        icon: Icons.error_outline,
        title: 'Could not load advertisements',
        subtitle: _error,
        actionLabel: 'Try Again',
        onAction: _load,
      );
    }

    if (_ads.isEmpty) {
      return EmptyState(
        icon: Icons.storefront_outlined,
        title: 'No advertisements found',
        subtitle: _activeFilterCount > 0
            ? 'Try changing or clearing your filters.'
            : 'New advertisements will appear here.',
        actionLabel: _activeFilterCount > 0 ? 'Clear Filters' : null,
        onAction: _activeFilterCount > 0 ? _clearFilters : null,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.75,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
        ),
        itemCount: _ads.length,
        itemBuilder: (context, index) {
          final ad = _ads[index];
          final id = ad['id']?.toString() ?? '';

          return _AdCard(
            ad: ad,
            isSaved: _savedIds.contains(id),
            isUpdating: _updatingIds.contains(id),
            onToggleSaved: () => _toggleSaved(ad),
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _locationController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }
}

class _AdCard extends StatelessWidget {
  final Map<String, dynamic> ad;
  final bool isSaved;
  final bool isUpdating;
  final VoidCallback onToggleSaved;

  const _AdCard({
    required this.ad,
    required this.isSaved,
    required this.isUpdating,
    required this.onToggleSaved,
  });

  String _relativeTime(String? dateString) {
    if (dateString == null) return '';

    final date = DateTime.tryParse(dateString);
    if (date == null) return '';

    final difference = DateTime.now().difference(date.toLocal());

    if (difference.inDays > 0) return '${difference.inDays}d ago';
    if (difference.inHours > 0) return '${difference.inHours}h ago';
    if (difference.inMinutes > 0) return '${difference.inMinutes}m ago';

    return 'just now';
  }

  @override
  Widget build(BuildContext context) {
    final price = double.tryParse(ad['price']?.toString() ?? '0') ?? 0;

    final ratingCount =
        int.tryParse(ad['rating_count']?.toString() ?? '0') ?? 0;

    final hasRating = ratingCount > 0;
    final time = _relativeTime(ad['published_at']?.toString());

    final images = ad['image_urls'];
    final hasImage = images is List && images.isNotEmpty;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/marketplace/ads/${ad['id']}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(
                    color: AppTheme.primaryColor.withValues(alpha: 0.1),
                    child: hasImage
                        ? Image.network(
                            images.first.toString(),
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Center(
                              child: Icon(
                                Icons.image_outlined,
                                size: 40,
                                color: context.appSecondaryText,
                              ),
                            ),
                          )
                        : Center(
                            child: Icon(
                              Icons.image_outlined,
                              size: 40,
                              color: context.appSecondaryText,
                            ),
                          ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: IconButton.filledTonal(
                      tooltip: isSaved ? 'Remove from saved' : 'Save ad',
                      onPressed: isUpdating ? null : onToggleSaved,
                      icon: isUpdating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : Icon(
                              isSaved ? Icons.favorite : Icons.favorite_border,
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 6,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (ad['category_name'] != null)
                      Text(
                        ad['category_name'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 9,
                        ),
                      ),
                    Text(
                      ad['title']?.toString() ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                    if (price > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        'GH₵ ${price.toStringAsFixed(2)}',
                        style: TextStyle(
                          color: context.isDarkMode
                              ? AppTheme.primaryLight
                              : AppTheme.primaryColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ],
                    if (ad['location'] != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        ad['location'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 10,
                        ),
                      ),
                    ],
                    if (hasRating || time.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (hasRating) ...[
                            const Icon(
                              Icons.star,
                              size: 10,
                              color: Color(0xFFFFB300),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              double.tryParse(
                                    ad['avg_rating']?.toString() ?? '0',
                                  )?.toStringAsFixed(1) ??
                                  '0.0',
                              style: TextStyle(
                                color: context.appSecondaryText,
                                fontSize: 9,
                              ),
                            ),
                            if (time.isNotEmpty)
                              Text(
                                ' · ',
                                style: TextStyle(
                                  color: context.appSecondaryText,
                                  fontSize: 9,
                                ),
                              ),
                          ],
                          if (time.isNotEmpty)
                            Text(
                              time,
                              style: TextStyle(
                                color: context.appSecondaryText,
                                fontSize: 9,
                              ),
                            ),
                        ],
                      ),
                    ],
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
