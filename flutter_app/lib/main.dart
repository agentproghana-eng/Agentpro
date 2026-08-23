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
    'Firebase notifications',
    _initializeFirebaseNotifications(),
  );

  _runNonBlocking(
    'Offline queue',
    OfflineQueueService.init(),
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

Future<void> _initializeFirebaseNotifications() async {
  await Firebase.initializeApp();
  await NotificationService.init();
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
  StreamSubscription<AuthState>? _notificationAuthSubscription;
  StreamSubscription<String>? _notificationNavigationSubscription;

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

      _notificationNavigationSubscription =
          NotificationService.navigationRequests.listen((_) {
        _consumePendingNotificationNavigation();
      });

      _notificationAuthSubscription = authBloc.stream.listen((state) {
        if (state is AuthAuthenticated) {
          _consumePendingNotificationNavigation();
        }
      });
    }
  }

  void _consumePendingNotificationNavigation() {
    final authBloc = _authBloc;
    final router = _router;

    // Never consume the pending route while the local session is locked,
    // signed out, or still restoring. AuthAuthenticated is emitted after a
    // successful trusted unlock/login, at which point the same pending tap
    // can safely continue.
    if (!mounted ||
        authBloc == null ||
        router == null ||
        authBloc.state is! AuthAuthenticated) {
      return;
    }

    final route = NotificationService.consumePendingNavigation();

    if (route == null || route.isEmpty) {
      return;
    }

    router.go(route);
  }

  @override
  void dispose() {
    _notificationNavigationSubscription?.cancel();
    _notificationAuthSubscription?.cancel();
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
          final isDark = Theme.of(context).brightness == Brightness.dark;

          final systemUiStyle = SystemUiOverlayStyle(
            statusBarColor: AppTheme.primaryDeep,
            statusBarIconBrightness: Brightness.light,
            statusBarBrightness: Brightness.dark,
            systemNavigationBarColor:
                isDark ? AppTheme.darkScaffoldBg : const Color(0xFFF7F9F8),
            systemNavigationBarIconBrightness:
                isDark ? Brightness.light : Brightness.dark,
            systemNavigationBarDividerColor: Colors.transparent,
          );

          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: systemUiStyle,
            child: InactivityDetector(
              timeout: const Duration(minutes: 5),
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
