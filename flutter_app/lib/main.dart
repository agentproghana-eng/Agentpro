import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_bloc.dart';
import 'core/services/storage_service.dart';
import 'core/services/notification_service.dart';
import 'core/services/inactivity_service.dart';
import 'core/router/app_router.dart';
import 'shared/theme/app_theme.dart';
import 'core/services/offline_queue_service.dart';
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // These don't depend on each other, so run them concurrently instead
  // of one after another - total startup time becomes whichever one is
  // slowest, not the sum of all of them. Jailbreak detection stays in
  // this blocking group (unlike notifications below) since it decides
  // which widget tree to even show - nothing should render until that's
  // known.
  final results = await Future.wait<dynamic>([
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]),
    Firebase.initializeApp(),
    StorageService.init(),
    OfflineQueueService.init(),
    FlutterJailbreakDetection.jailbroken.catchError((_) => false),
  ]);

  final isJailbroken = results[4] as bool;

  runApp(AgentProApp(isJailbroken: isJailbroken));

  // Notification permission (a native OS prompt) and FCM setup don't
  // need to block the very first frame - deferred until after the app
  // is already visible, so a permission dialog is never the first
  // thing a user sees on cold launch.
  unawaited(NotificationService.init());

  // Same reasoning - the AdMob SDK only matters once a Free Personal
  // user actually reaches Personal Home, nowhere near the first frame.
  unawaited(MobileAds.instance.initialize());
}

class AgentProApp extends StatelessWidget {
  final bool isJailbroken;

  const AgentProApp({super.key, required this.isJailbroken});

  @override
  Widget build(BuildContext context) {
    if (isJailbroken) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.red[900],
          body: const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.security, size: 80, color: Colors.white),
                  SizedBox(height: 24),
                  Text(
                    'Security Alert',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Agent Pro Ghana cannot run on a rooted or compromised device.\n\n'
                    'This policy protects your financial data and mobile money transactions.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 16),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AuthBloc()..add(AuthCheckEvent())),
      ],
      child: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, authState) {
          final router = AppRouter.createRouter(authState);
          return MaterialApp.router(
            title: 'Agent Pro Ghana',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: ThemeMode.system,
            routerConfig: router,
            builder: (context, child) {
              // Wrapped here (inside MaterialApp, below the Navigator) rather
              // than outside MaterialApp.router, so that ScaffoldMessenger
              // and Navigator ancestors are available when the inactivity
              // timeout fires and needs to show a SnackBar.
              return InactivityDetector(
                timeout: const Duration(minutes: 5),
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
      ),
    );
  }
}
