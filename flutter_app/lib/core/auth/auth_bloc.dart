import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/storage_service.dart';
import '../api/api_client.dart';
import '../services/biometric_service.dart';
import '../services/notification_service.dart';

// ── Events ────────────────────────────────────────────────────
abstract class AuthEvent {}

class AuthCheckEvent extends AuthEvent {}

class AuthLoginEvent extends AuthEvent {
  final String email, password;
  final String? fcmToken;
  AuthLoginEvent({required this.email, required this.password, this.fcmToken});
}

class AuthLogoutEvent extends AuthEvent {}

class AuthLockEvent extends AuthEvent {}

class AuthUnlockEvent extends AuthEvent {
  final DeviceAuthApproval approval;

  AuthUnlockEvent(this.approval);
}

class AuthSessionInvalidatedEvent extends AuthEvent {}

// Personal Subscriber registration - lightweight, no company involved,
// mirrors AuthLoginEvent's save-tokens-and-emit pattern but posts to
// register-personal instead of login, since there's no separate login
// step needed (the backend auto-issues working tokens on success, no
// approval gate to wait on).
class AuthRegisterPersonalEvent extends AuthEvent {
  final String firstName, lastName, email, phone, password;
  AuthRegisterPersonalEvent({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.password,
  });
}

// Merges updated fields into the cached user and persists them locally -
// for self-service settings changes (e.g. Telecel Operator ID) that
// don't require a full re-login to take effect app-wide.
class AuthUpdateUserEvent extends AuthEvent {
  final Map<String, dynamic> updatedFields;
  AuthUpdateUserEvent(this.updatedFields);
}

// ── States ────────────────────────────────────────────────────
abstract class AuthState extends Equatable {
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class AuthAuthenticated extends AuthState {
  final Map<String, dynamic> user;
  AuthAuthenticated(this.user);
  @override
  List<Object?> get props => [user];
}

class AuthUnauthenticated extends AuthState {}

class AuthError extends AuthState {
  final String message;
  AuthError(this.message);
  @override
  List<Object?> get props => [message];
}

// ── BLoC ──────────────────────────────────────────────────────
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  late final StreamSubscription<void> _sessionInvalidationSubscription;

  AuthBloc() : super(AuthInitial()) {
    on<AuthCheckEvent>(_onCheck);
    on<AuthLoginEvent>(_onLogin);
    on<AuthRegisterPersonalEvent>(_onRegisterPersonal);
    on<AuthLockEvent>(_onLock);
    on<AuthUnlockEvent>(_onUnlock);
    on<AuthSessionInvalidatedEvent>(
      _onSessionInvalidated,
    );
    on<AuthLogoutEvent>(_onLogout);
    on<AuthUpdateUserEvent>(_onUpdateUser);

    _sessionInvalidationSubscription =
        ApiClient.sessionInvalidations.listen((_) {
      if (!isClosed) {
        add(AuthSessionInvalidatedEvent());
      }
    });
  }

  Future<void> _onCheck(
    AuthCheckEvent event,
    Emitter<AuthState> emit,
  ) async {
    final startupState = state;

    final user = await StorageService.getUser();

    if (!identical(state, startupState)) {
      return;
    }

    final accessToken = await StorageService.getAccessToken();

    if (!identical(state, startupState)) {
      return;
    }

    final refreshToken = await StorageService.getRefreshToken();

    if (!identical(state, startupState)) {
      return;
    }

    final sessionLocked = await StorageService.isSessionLocked();

    if (!identical(state, startupState)) {
      return;
    }

    if (user == null ||
        accessToken == null ||
        accessToken.isEmpty ||
        refreshToken == null ||
        refreshToken.isEmpty) {
      emit(AuthUnauthenticated());
      return;
    }

    if (sessionLocked) {
      emit(AuthUnauthenticated());
      return;
    }

    final deviceAuthPreference = await StorageService.getDeviceAuthPreference();

    if (!identical(state, startupState)) {
      return;
    }

    if (deviceAuthPreference != false) {
      await StorageService.setSessionLocked(true);

      if (!identical(state, startupState)) {
        if (state is AuthAuthenticated) {
          await StorageService.setSessionLocked(false);
        }
        return;
      }

      emit(AuthUnauthenticated());
      return;
    }

    if (!identical(state, startupState)) {
      return;
    }

    emit(AuthAuthenticated(user));

    unawaited(
      NotificationService.syncTokenWithBackend(),
    );
  }

  Future<void> _onLogin(AuthLoginEvent event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final response = await ApiClient.instance.post('/auth/login', data: {
        'email': event.email,
        'password': event.password,
        if (event.fcmToken != null) 'fcm_token': event.fcmToken,
      });

      final data = response.data['data'];
      await StorageService.saveAccessToken(data['access_token']);
      await StorageService.saveRefreshToken(data['refresh_token']);
      await StorageService.saveUser(data['user']);

      await StorageService.setSessionLocked(false);

      unawaited(
        NotificationService.syncTokenWithBackend(),
      );

      emit(AuthAuthenticated(data['user']));
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;

      if (statusCode == 401) {
        emit(AuthError('Invalid email or password.'));
        return;
      }

      if (statusCode == 403) {
        emit(AuthError('Your account is pending approval.'));
        return;
      }

      final serverUnreachable = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout;

      if (serverUnreachable) {
        emit(
          AuthError(
            'AgentPro cannot reach the server. '
            'If you have previously signed in on this phone, '
            'use Unlock AgentPro.',
          ),
        );
        return;
      }

      emit(AuthError('Login failed. Please try again.'));
    } on Exception {
      emit(AuthError('Login failed. Please try again.'));
    }
  }

  Future<void> _onRegisterPersonal(
      AuthRegisterPersonalEvent event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    try {
      final response =
          await ApiClient.instance.post('/auth/register-personal', data: {
        'first_name': event.firstName,
        'last_name': event.lastName,
        'email': event.email,
        'phone': event.phone,
        'password': event.password,
      });

      final data = response.data['data'];
      await StorageService.saveAccessToken(data['access_token']);
      await StorageService.saveRefreshToken(data['refresh_token']);
      await StorageService.saveUser(data['user']);
      await StorageService.setSessionLocked(false);
      unawaited(
        NotificationService.syncTokenWithBackend(),
      );

      emit(AuthAuthenticated(data['user']));
    } on Exception catch (e) {
      String message = 'Registration failed. Please try again.';
      if (e.toString().contains('409')) {
        message = 'An account with this email already exists.';
      }
      emit(AuthError(message));
    }
  }

  Future<void> _onLock(
    AuthLockEvent event,
    Emitter<AuthState> emit,
  ) async {
    final deviceAuthEnabled = await BiometricService.isDeviceAuthEnabled();

    if (deviceAuthEnabled) {
      // Soft-lock locally without destroying the encrypted server session.
      // API requests are blocked while this flag is set, and successful
      // phone authentication can unlock AgentPro with zero network traffic.
      await StorageService.setSessionLocked(true);
    } else {
      // Without device authentication there is no trusted unlock path,
      // so inactivity becomes a normal session termination.
      try {
        final refreshToken = await StorageService.getRefreshToken();

        String? fcmToken;
        try {
          fcmToken = await NotificationService.getToken();
        } catch (_) {}

        if (refreshToken != null && refreshToken.isNotEmpty) {
          await ApiClient.instance.post(
            '/auth/logout',
            data: {
              'refresh_token': refreshToken,
              if (fcmToken != null && fcmToken.trim().isNotEmpty)
                'fcm_token': fcmToken.trim(),
            },
          );
        }
      } catch (_) {}

      await StorageService.clearSession();
    }

    emit(AuthUnauthenticated());
  }

  Future<void> _onUnlock(
    AuthUnlockEvent event,
    Emitter<AuthState> emit,
  ) async {
    // AuthUnlockEvent is not trusted by itself. Only the exact one-time
    // approval object created after successful OS authentication can unlock.
    if (!BiometricService.consumeUnlockApproval(event.approval)) {
      await StorageService.setSessionLocked(true);
      emit(AuthUnauthenticated());
      return;
    }

    final user = await StorageService.getUser();
    final accessToken = await StorageService.getAccessToken();
    final refreshToken = await StorageService.getRefreshToken();

    if (user == null ||
        accessToken == null ||
        accessToken.isEmpty ||
        refreshToken == null ||
        refreshToken.isEmpty) {
      await StorageService.setSessionLocked(true);
      emit(AuthUnauthenticated());
      return;
    }

    await StorageService.setSessionLocked(false);
    emit(AuthAuthenticated(user));

    unawaited(
      NotificationService.syncTokenWithBackend(),
    );
  }

  Future<void> _onSessionInvalidated(
    AuthSessionInvalidatedEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthUnauthenticated());
  }

  Future<void> _onLogout(
    AuthLogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    try {
      final refreshToken = await StorageService.getRefreshToken();

      String? fcmToken;
      try {
        fcmToken = await NotificationService.getToken();
      } catch (_) {}

      if (refreshToken != null && refreshToken.isNotEmpty) {
        await ApiClient.instance.post(
          '/auth/logout',
          data: {
            'refresh_token': refreshToken,
            if (fcmToken != null && fcmToken.trim().isNotEmpty)
              'fcm_token': fcmToken.trim(),
          },
        );
      }
    } catch (_) {}

    // Explicit Sign Out is always a true local sign-out regardless of
    // whether device authentication is enabled.
    await StorageService.clearSession();

    emit(AuthUnauthenticated());
  }

  Future<void> _onUpdateUser(
      AuthUpdateUserEvent event, Emitter<AuthState> emit) async {
    final currentState = state;
    if (currentState is AuthAuthenticated) {
      final updatedUser = Map<String, dynamic>.from(currentState.user)
        ..addAll(event.updatedFields);
      await StorageService.saveUser(updatedUser);
      emit(AuthAuthenticated(updatedUser));
    }
  }

  @override
  Future<void> close() async {
    await _sessionInvalidationSubscription.cancel();
    return super.close();
  }
}
