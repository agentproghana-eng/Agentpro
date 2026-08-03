import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class DashboardSkeleton extends StatefulWidget {
  final Widget child;

  const DashboardSkeleton({super.key, required this.child});

  @override
  State<DashboardSkeleton> createState() => _DashboardSkeletonState();
}

class _DashboardSkeletonState extends State<DashboardSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _opacity = Tween<double>(
      begin: 0.42,
      end: 0.78,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: IgnorePointer(child: widget.child),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}

class SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;

  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.appSecondaryText.withOpacity(
          context.isDarkMode ? 0.18 : 0.11,
        ),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class ShiftCardSkeleton extends StatelessWidget {
  const ShiftCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return DashboardSkeleton(
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.appSecondaryText.withOpacity(0.07)),
        ),
        child: const Row(
          children: [
            SkeletonBox(width: 38, height: 38, radius: 19),
            SizedBox(width: 12),
            Expanded(child: SkeletonBox(height: 13)),
            SizedBox(width: 20),
            SkeletonBox(width: 82, height: 38, radius: 12),
          ],
        ),
      ),
    );
  }
}

class RecentTransactionsSkeleton extends StatelessWidget {
  final int itemCount;

  const RecentTransactionsSkeleton({super.key, this.itemCount = 3});

  @override
  Widget build(BuildContext context) {
    return DashboardSkeleton(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(
          children: List.generate(
            itemCount,
            (index) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: context.appSecondaryText.withOpacity(0.06),
                ),
              ),
              child: const Row(
                children: [
                  SkeletonBox(width: 38, height: 38, radius: 10),
                  SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 150, height: 12),
                        SizedBox(height: 7),
                        SkeletonBox(width: 105, height: 9),
                      ],
                    ),
                  ),
                  SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      SkeletonBox(width: 65, height: 12),
                      SizedBox(height: 7),
                      SkeletonBox(width: 45, height: 9),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
