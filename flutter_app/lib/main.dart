import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';

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

  // Lock orientation to portrait
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Initialize Firebase
  await Firebase.initializeApp();


  // Initialize encrypted storage
  await StorageService.init();

  // Initialize offline transaction queue
  await OfflineQueueService.init();
  // Initialize notifications
  await NotificationService.init();

  // Security: Detect rooted/tampered device
  bool isJailbroken = false;
  try {
    isJailbroken = await FlutterJailbreakDetection.jailbroken;
  } catch (_) {}

  runApp(AgentProApp(isJailbroken: isJailbroken));
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
