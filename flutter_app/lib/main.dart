import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import 'package:go_router/go_router.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'core/auth/auth_bloc.dart';
import 'core/router/app_router.dart';
import 'core/services/inactivity_service.dart';
import 'core/services/notification_service.dart';
import 'core/services/permission_service.dart';
import 'core/services/ussd_service.dart';
import 'core/services/offline_queue_service.dart';
import 'core/services/storage_service.dart';
import 'shared/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final results = await Future.wait<dynamic>([
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]),
    StorageService.init(),
    FlutterJailbreakDetection.jailbroken
        .timeout(
          const Duration(seconds: 2),
          onTimeout: () => false,
        )
        .catchError((_) => false),
  ]);

  final isJailbroken = results[2] as bool;

  runApp(AgentProApp(isJailbroken: isJailbroken));

  _runNonBlocking(
    'Firebase',
    Firebase.initializeApp(),
  );

  _runNonBlocking(
    'Offline queue',
    OfflineQueueService.init(),
  );

  _runNonBlocking(
    'Notifications',
    NotificationService.init(),
  );

  // Retained for the current agent workflow: requesting this early
  // allows installed SIM cards to be detected promptly after startup.
  // The transaction screen still performs its own permission check
  // before dialing as a safety net.
  _runNonBlocking(
    'Telephony permissions',
    PermissionService.requestTelephonyPermissions(),
  );

  _runNonBlocking(
    'Mobile ads',
    MobileAds.instance.initialize(),
  );
}

void _runNonBlocking(
  String serviceName,
  Future<dynamic> future,
) {
  unawaited(
    future.catchError((Object error, StackTrace stackTrace) {
      debugPrint(
        '$serviceName initialization failed: $error\n$stackTrace',
      );

      return null;
    }),
  );
}

class AgentProApp extends StatefulWidget {
  const AgentProApp({
    super.key,
    required this.isJailbroken,
  });

  final bool isJailbroken;

  @override
  State<AgentProApp> createState() => _AgentProAppState();
}

class _AgentProAppState extends State<AgentProApp> {
  AuthBloc? _authBloc;
  AuthRouterRefreshNotifier? _routerRefreshNotifier;
  GoRouter? _router;

  @override
  void initState() {
    super.initState();

    if (!widget.isJailbroken) {
      final authBloc = AuthBloc()..add(AuthCheckEvent());
      final refreshNotifier = AuthRouterRefreshNotifier(
        authBloc.stream,
      );

      _authBloc = authBloc;
      _routerRefreshNotifier = refreshNotifier;
      _router = AppRouter.createRouter(
        authBloc,
        refreshListenable: refreshNotifier,
      );
    }
  }

  @override
  void dispose() {
    _router?.dispose();
    _routerRefreshNotifier?.dispose();
    _authBloc?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isJailbroken) {
      return const _CompromisedDeviceApp();
    }

    final authBloc = _authBloc;
    final router = _router;

    if (authBloc == null || router == null) {
      return const SizedBox.shrink();
    }

    return BlocProvider.value(
      value: authBloc,
      child: MaterialApp.router(
        title: 'Agent Pro Ghana',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.system,
        routerConfig: router,
        builder: (context, child) {
          return InactivityDetector(
            timeout: const Duration(minutes: 5),
            child: _AccessibilityGate(
              child: child ?? const SizedBox.shrink(),
            ),
          );
        },
      ),
    );
  }
}

class _CompromisedDeviceApp extends StatelessWidget {
  const _CompromisedDeviceApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: Colors.red.shade900,
        body: const SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.security,
                    size: 80,
                    color: Colors.white,
                    semanticLabel: 'Security warning',
                  ),
                  SizedBox(height: 24),
                  Text(
                    'Security Alert',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Agent Pro Ghana cannot run on a rooted or '
                    'compromised device.\n\n'
                    'This policy protects your financial data and '
                    'mobile money transactions.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 16,
                    ),
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

// Checked once per cold launch, after the first frame - Accessibility
// Service can't be requested via a system permission dialog the way
// READ_PHONE_STATE/notifications can (Android only allows enabling it
// through Settings), so this shows an in-app explainer with a button
// the user taps, which THEN opens Settings - never an unprompted
// redirect into system settings on cold start.
class _AccessibilityGate extends StatefulWidget {
  final Widget child;
  const _AccessibilityGate({required this.child});

  @override
  State<_AccessibilityGate> createState() => _AccessibilityGateState();
}

class _AccessibilityGateState extends State<_AccessibilityGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkAccessibility());
  }

  Future<void> _checkAccessibility() async {
    final enabled = await UssdAccessibilityEngine().isServiceEnabled();
    if (!enabled && mounted) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Enable Automated Transactions'),
          content: const Text(
            'Agent Pro Ghana uses Accessibility Service to automatically complete USSD transactions for you. '
            'Without it, every transaction has to be completed manually on the dial screen.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Not Now'),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                UssdAccessibilityEngine().openAccessibilitySettings();
              },
              child: const Text('Open Settings'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
