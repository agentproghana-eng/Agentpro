import 'dart:async';

class DashboardRefreshEvent {
  final bool isPersonal;
  final String provider;

  const DashboardRefreshEvent({
    required this.isPersonal,
    required this.provider,
  });
}

class DashboardRefreshService {
  DashboardRefreshService._();

  static final StreamController<DashboardRefreshEvent> _controller =
      StreamController<DashboardRefreshEvent>.broadcast();

  static Stream<DashboardRefreshEvent> get events => _controller.stream;

  static void notifyTransactionCompleted({
    required bool isPersonal,
    required String provider,
  }) {
    _controller.add(
      DashboardRefreshEvent(isPersonal: isPersonal, provider: provider),
    );
  }
}
