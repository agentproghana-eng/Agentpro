import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/storage_service.dart';
import '../api/api_client.dart';
import '../services/biometric_service.dart';

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

class AuthUnlockEvent extends AuthEvent {}

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
  AuthBloc() : super(AuthInitial()) {
    on<AuthCheckEvent>(_onCheck);
    on<AuthLoginEvent>(_onLogin);
    on<AuthRegisterPersonalEvent>(_onRegisterPersonal);
    on<AuthLockEvent>(_onLock);
    on<AuthUnlockEvent>(_onUnlock);
    on<AuthLogoutEvent>(_onLogout);
    on<AuthUpdateUserEvent>(_onUpdateUser);
  }

  Future<void> _onCheck(
    AuthCheckEvent event,
    Emitter<AuthState> emit,
  ) async {
    final user = await StorageService.getUser();
    final token = await StorageService.getAccessToken();

    // A normal startup check may restore only an already-open session.
    // It must never exchange a preserved refresh token because doing so
    // would bypass an inactivity/device-authentication lock.
    if (user != null && token != null) {
      emit(AuthAuthenticated(user));
    } else {
      emit(AuthUnauthenticated());
    }
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

      emit(AuthAuthenticated(data['user']));
    } on Exception catch (e) {
      String message = 'Login failed. Please try again.';
      if (e.toString().contains('403')) {
        message = 'Your account is pending approval.';
      }
      if (e.toString().contains('401')) message = 'Invalid email or password.';
      emit(AuthError(message));
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
    final deviceAuthEnabled = await BiometricService.isBiometricEnabled();

    if (deviceAuthEnabled) {
      // Soft-lock: preserve the refresh token so a successful device
      // authentication challenge can restore this same session.
      await StorageService.clearAccessTokenOnly();
    } else {
      // Without device authentication there is no trusted unlock path,
      // so inactivity becomes a normal session termination.
      try {
        final refreshToken = await StorageService.getRefreshToken();

        if (refreshToken != null && refreshToken.isNotEmpty) {
          await ApiClient.instance.post(
            '/auth/logout',
            data: {'refresh_token': refreshToken},
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
    final user = await StorageService.getUser();
    final refreshToken = await StorageService.getRefreshToken();

    if (user == null || refreshToken == null || refreshToken.isEmpty) {
      emit(AuthUnauthenticated());
      return;
    }

    final refreshed = await ApiClient.refreshToken();
    final token = await StorageService.getAccessToken();

    if (refreshed && token != null) {
      emit(AuthAuthenticated(user));
    } else {
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onLogout(
    AuthLogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    try {
      final refreshToken = await StorageService.getRefreshToken();

      if (refreshToken != null && refreshToken.isNotEmpty) {
        await ApiClient.instance.post(
          '/auth/logout',
          data: {'refresh_token': refreshToken},
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
}
