import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../auth/auth_bloc.dart';

/// Monitors user inactivity and logs out after timeout.
/// Wraps the entire app to detect any touch/interaction.
class InactivityDetector extends StatefulWidget {
  final Widget child;
  final Duration timeout;
  final VoidCallback? onTimeout;

  const InactivityDetector({
    super.key,
    required this.child,
    this.timeout = const Duration(minutes: 5),
    this.onTimeout,
  });

  @override
  State<InactivityDetector> createState() => _InactivityDetectorState();
}

class _InactivityDetectorState extends State<InactivityDetector>
    with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _resetTimer();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      // Start countdown when app goes to background
      _startBackgroundTimer();
    } else if (state == AppLifecycleState.resumed) {
      _resetTimer();
    }
  }

  void _resetTimer() {
    _timer?.cancel();
    _timer = Timer(widget.timeout, _onTimeout);
  }

  void _startBackgroundTimer() {
    _timer?.cancel();
    // Give a bit more time when in background (2x)
    _timer = Timer(widget.timeout * 2, _onTimeout);
  }

  void _onTimeout() {
    if (!mounted) return;
    final authBloc = context.read<AuthBloc>();
    if (authBloc.state is AuthAuthenticated) {
      authBloc.add(AuthLogoutEvent());
      widget.onTimeout?.call();
      // Show snackbar on next frame after logout navigates to login
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('You were logged out due to inactivity.'),
              duration: Duration(seconds: 4),
            ),
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _resetTimer,
      onPanDown: (_) => _resetTimer(),
      onScaleStart: (_) => _resetTimer(),
      behavior: HitTestBehavior.translucent,
      child: widget.child,
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
