// personal_ad_banner.dart
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// Free-tier-only banner shown at the bottom of Personal Home, per
/// spec (~1/8 screen height, hence AdSize.largeBanner at 320x100
/// rather than the smaller standard 320x50 banner). Uses Google's
/// public TEST ad unit ID for now - MUST be replaced with a real ad
/// unit ID from an actual AdMob console before any real launch,
/// alongside the App ID already set in AndroidManifest.xml. Fails
/// silently (renders nothing) if the ad can't load, rather than
/// showing a broken placeholder - a failed ad load shouldn't visibly
/// break the screen around it.
class PersonalAdBanner extends StatefulWidget {
  const PersonalAdBanner({super.key});
  @override
  State<PersonalAdBanner> createState() => _PersonalAdBannerState();
}

class _PersonalAdBannerState extends State<PersonalAdBanner> {
  BannerAd? _bannerAd;
  bool _isLoaded = false;

  // Google's public TEST banner ad unit ID for Android.
  static const _testAdUnitId = 'ca-app-pub-3940256099942544/6300978111';

  @override
  void initState() {
    super.initState();
    _loadAd();
  }

  void _loadAd() {
    _bannerAd = BannerAd(
      adUnitId: _testAdUnitId,
      size: AdSize.largeBanner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          if (mounted) setState(() => _isLoaded = true);
        },
        onAdFailedToLoad: (ad, error) {
          ad.dispose();
        },
      ),
    )..load();
  }

  @override
  void dispose() {
    _bannerAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isLoaded || _bannerAd == null) return const SizedBox.shrink();
    return Container(
      alignment: Alignment.center,
      width: _bannerAd!.size.width.toDouble(),
      height: _bannerAd!.size.height.toDouble(),
      child: AdWidget(ad: _bannerAd!),
    );
  }
}
