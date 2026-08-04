import 'dart:math' as math;
import 'package:flutter/material.dart';

class AgentProRefreshIndicator extends StatefulWidget {
  const AgentProRefreshIndicator({
    super.key,
    required this.child,
    required this.onRefresh,
  });

  final Widget child;
  final Future<void> Function() onRefresh;

  @override
  State<AgentProRefreshIndicator> createState() =>
      _AgentProRefreshIndicatorState();
}

class _AgentProRefreshIndicatorState
    extends State<AgentProRefreshIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      displacement: 72,
      strokeWidth: 0.01,
      color: Colors.transparent,
      backgroundColor: Colors.transparent,
      onRefresh: widget.onRefresh,
      child: Stack(
        children: [
          widget.child,
          Positioned(
            top: 10,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _controller,
                builder: (_, __) {
                  return Transform.rotate(
                    angle: _controller.value * 2 * math.pi,
                    child: Column(
                      children: [
                        Image.asset(
                          'assets/images/agentpro-icon.png',
                          height: 34,
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Refreshing dashboard...',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
