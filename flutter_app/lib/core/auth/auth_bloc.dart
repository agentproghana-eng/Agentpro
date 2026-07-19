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
// Merges updated fields into the cached user and persists them locally -
// for self-service settings changes (e.g. Telecel Operator ID) that
// don't require a full re-login to take effect app-wide.
class AuthUpdateUserEvent extends AuthEvent {
  final Map<String, dynamic> updatedFields;
  AuthUpdateUserEvent(this.updatedFields);
}

// ── States ────────────────────────────────────────────────────
abstract class AuthState extends Equatable {
  @override List<Object?> get props => [];
}
class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthAuthenticated extends AuthState {
  final Map<String, dynamic> user;
  AuthAuthenticated(this.user);
  @override List<Object?> get props => [user];
}
class AuthUnauthenticated extends AuthState {}
class AuthError extends AuthState {
  final String message;
  AuthError(this.message);
  @override List<Object?> get props => [message];
}

// ── BLoC ──────────────────────────────────────────────────────
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc() : super(AuthInitial()) {
    on<AuthCheckEvent>(_onCheck);
    on<AuthLoginEvent>(_onLogin);
    on<AuthLogoutEvent>(_onLogout);
    on<AuthUpdateUserEvent>(_onUpdateUser);
  }

  Future<void> _onCheck(AuthCheckEvent event, Emitter<AuthState> emit) async {
    final user = await StorageService.getUser();
    var token = await StorageService.getAccessToken();

    // No access token yet, but a refresh token may still be present -
    // e.g. after a logout that deliberately preserved it for a
    // biometric-enabled device. Try to silently obtain a fresh access
    // token before giving up.
    if (token == null && user != null) {
      final refreshed = await ApiClient.refreshToken();
      if (refreshed) {
        token = await StorageService.getAccessToken();
      }
    }

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
      if (e.toString().contains('403')) message = 'Your account is pending approval.';
      if (e.toString().contains('401')) message = 'Invalid email or password.';
      emit(AuthError(message));
    }
  }

  Future<void> _onLogout(AuthLogoutEvent event, Emitter<AuthState> emit) async {
    final biometricEnabled = await BiometricService.isBiometricEnabled();

    if (!biometricEnabled) {
      // Full logout: revoke everything server-side, clear all local
      // session data.
      try {
        final refreshToken = await StorageService.getRefreshToken();
        await ApiClient.instance.post("/auth/logout", data: {"refresh_token": refreshToken});
      } catch (_) {}
      await StorageService.clearSession();
    } else {
      // Soft logout: end the local UI session only, deliberately
      // skipping the backend call, which would revoke the refresh
      // token entirely. The refresh token stays valid so biometric
      // can silently restore access next time. Fully revoking access
      // for this device happens when the user disables biometric in
      // Settings, or changes their password.
      await StorageService.clearAccessTokenOnly();
    }

    emit(AuthUnauthenticated());
  }

  Future<void> _onUpdateUser(AuthUpdateUserEvent event, Emitter<AuthState> emit) async {
    final currentState = state;
    if (currentState is AuthAuthenticated) {
      final updatedUser = Map<String, dynamic>.from(currentState.user)
        ..addAll(event.updatedFields);
      await StorageService.saveUser(updatedUser);
      emit(AuthAuthenticated(updatedUser));
    }
  }
}
