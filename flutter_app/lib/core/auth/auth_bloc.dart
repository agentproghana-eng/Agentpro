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

// Offline PIN unlock. The PIN never touches the server - it only ever
// unlocks a session already cached on this device from a prior real
// online login. Mirrors how biometric already works: LoginScreen
// itself checks whether a PIN is set (same as it already checks
// isBiometricEnabled()) and shows a PIN pad instead of the full form -
// no dedicated auth state or router change needed, same architecture
// biometric already uses successfully. See storage_service.dart for
// the hashing details.
class AuthPinLoginEvent extends AuthEvent {
  final String pin;
  AuthPinLoginEvent(this.pin);
}
class AuthSetPinEvent extends AuthEvent {
  final String pin;
  AuthSetPinEvent(this.pin);
}
class AuthClearPinEvent extends AuthEvent {}

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
class AuthPinError extends AuthState {
  final String message;
  AuthPinError(this.message);
  @override List<Object?> get props => [message];
}

// ── BLoC ──────────────────────────────────────────────────────
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc() : super(AuthInitial()) {
    on<AuthCheckEvent>(_onCheck);
    on<AuthLoginEvent>(_onLogin);
    on<AuthLogoutEvent>(_onLogout);
    on<AuthUpdateUserEvent>(_onUpdateUser);
    on<AuthPinLoginEvent>(_onPinLogin);
    on<AuthSetPinEvent>(_onSetPin);
    on<AuthClearPinEvent>(_onClearPin);
  }

  Future<void> _onCheck(AuthCheckEvent event, Emitter<AuthState> emit) async {
    final user = await StorageService.getUser();
    var token = await StorageService.getAccessToken();

    // No access token yet, but a refresh token may still be present -
    // e.g. after a logout that deliberately preserved it for a
    // biometric- or PIN-enabled device. Try to silently obtain a fresh
    // access token before giving up. (PIN unlock itself bypasses this
    // entirely via AuthPinLoginEvent below, which restores the cached
    // session directly with no network call - this path only matters
    // when neither biometric nor PIN got the user in first.)
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

  // Verifies the PIN locally against the stored salted hash - no
  // network call at all, which is what makes this fast and offline-
  // capable. On success, restores AuthAuthenticated directly from the
  // already-cached user - the same session that was there before the
  // soft logout, no server round trip needed to see it again.
  Future<void> _onPinLogin(AuthPinLoginEvent event, Emitter<AuthState> emit) async {
    final user = await StorageService.getUser();
    if (user == null) {
      emit(AuthUnauthenticated());
      return;
    }

    final valid = await StorageService.verifyPin(event.pin);
    if (valid) {
      emit(AuthAuthenticated(user));
    } else {
      emit(AuthPinError('Incorrect PIN'));
    }
  }

  // Sets or replaces the PIN. Only meaningful for an already-online,
  // already-authenticated user - there is deliberately no path to set
  // a PIN without having first logged in for real, since the PIN only
  // ever unlocks a session that already exists.
  Future<void> _onSetPin(AuthSetPinEvent event, Emitter<AuthState> emit) async {
    await StorageService.savePin(event.pin);
    final currentState = state;
    if (currentState is AuthAuthenticated) {
      emit(AuthAuthenticated(currentState.user));
    }
  }

  Future<void> _onClearPin(AuthClearPinEvent event, Emitter<AuthState> emit) async {
    await StorageService.clearPin();
    final currentState = state;
    if (currentState is AuthAuthenticated) {
      emit(AuthAuthenticated(currentState.user));
    }
  }

  Future<void> _onLogout(AuthLogoutEvent event, Emitter<AuthState> emit) async {
    final biometricEnabled = await BiometricService.isBiometricEnabled();
    final pinSet = await StorageService.hasPinSet();

    if (!biometricEnabled && !pinSet) {
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
      // token entirely. The refresh token stays valid so biometric or
      // PIN can restore access next time - LoginScreen checks for
      // both on load, same as it already does for biometric alone.
      // Fully revoking access for this device happens when the user
      // disables both biometric and PIN in Settings, or changes their
      // password.
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
