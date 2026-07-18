import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_bloc.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/auth/forgot_password_screen.dart';
import '../../features/auth/force_password_change_screen.dart';
import '../../features/dashboard/agent_dashboard.dart';
import '../../features/dashboard/manager_dashboard.dart';
import '../../features/dashboard/owner_dashboard.dart';
import '../../features/transactions/transaction_screen.dart';
import '../../features/transactions/transaction_progress_screen.dart';
import '../../features/transactions/transaction_detail_screen.dart';
import '../../features/sync/sync_queue_screen.dart';
import '../../features/float/float_screen.dart';
import '../../features/balances/my_balance_screen.dart';
import '../../features/balances/float_received_screen.dart';
import '../../features/balances/commission_transfer_screen.dart';
import '../../features/balances/cash_adjustment_screen.dart';
import '../../features/balances/pending_approvals_screen.dart';
import '../../features/support/support_screen.dart';
import '../../features/ussd_settings/ussd_settings_screen.dart';
import '../../features/community/community_feed_screen.dart';
import '../../features/community/post_detail_screen.dart';
import '../../features/community/post_moderation_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/ai_assistant/ai_assistant_screen.dart';
import '../../features/subscription/subscription_screen.dart';
import '../../features/marketplace/marketplace_screen.dart';
import '../../features/marketplace/post_ad_screen.dart';
import '../../features/marketplace/my_ads_screen.dart';
import '../../features/marketplace/ad_detail_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/branches/branches_screen.dart';
import '../../features/staff/staff_management_screen.dart';

class AppRouter {
  static GoRouter createRouter(AuthState authState) {
    return GoRouter(
      initialLocation: '/',
      redirect: (context, state) {
        final isLoggedIn = authState is AuthAuthenticated;
        final isAuthRoute = state.matchedLocation.startsWith("/auth");
        final mustChangePassword = isLoggedIn &&
            authState.user["must_change_password"] == true;
        final isForcedChangeRoute = state.matchedLocation == "/auth/change-password-required";

        if (!isLoggedIn && !isAuthRoute) return "/auth/login";
        if (mustChangePassword && !isForcedChangeRoute) return "/auth/change-password-required";
        if (isLoggedIn && !mustChangePassword && isAuthRoute) return _homeForRole(authState);
        return null;
      },
      routes: [
        // Auth routes
        GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/auth/register', builder: (_, __) => const RegisterScreen()),
        GoRoute(path: '/auth/change-password-required', builder: (_, __) => const ForcePasswordChangeScreen()),
        GoRoute(path: '/auth/forgot-password', builder: (_, __) => const ForgotPasswordScreen()),

        // Role dashboards
        GoRoute(path: '/agent', builder: (_, __) => const AgentDashboard()),
        GoRoute(path: '/manager', builder: (_, __) => const ManagerDashboard()),
        GoRoute(path: '/owner', builder: (_, __) => const OwnerDashboard()),

        // Transactions
        GoRoute(
          path: '/transactions',
          builder: (_, state) {
            final type = state.uri.queryParameters['type'] ?? 'cash_in';
            return TransactionScreen(transactionType: type);
          },
        ),
        GoRoute(
          path: '/transactions/progress',
          builder: (_, state) {
            final extra = state.extra as Map<String, dynamic>;
            return TransactionProgressScreen(data: extra);
          },
        ),
        GoRoute(
          path: '/transactions/:id',
          builder: (_, state) => TransactionDetailScreen(transactionId: state.pathParameters['id']!),
        ),
        GoRoute(path: '/sync', builder: (_, __) => const SyncQueueScreen()),

        // Float
        GoRoute(path: '/float', builder: (_, state) => FloatScreen(branchId: state.uri.queryParameters['branch_id'])),
        GoRoute(path: '/my-balance', builder: (_, __) => const MyBalanceScreen()),
        GoRoute(
          path: '/balances/float-received',
          builder: (_, state) => FloatReceivedScreen(initialProvider: (state.extra as Map)['provider'] as String),
        ),
        GoRoute(
          path: '/balances/commission-transfer',
          builder: (_, state) => CommissionTransferScreen(provider: (state.extra as Map)['provider'] as String),
        ),
        GoRoute(
          path: '/balances/cash-adjustment',
          builder: (_, state) => CashAdjustmentScreen(provider: (state.extra as Map)['provider'] as String),
        ),
        GoRoute(path: '/balances/pending-approvals', builder: (_, __) => const PendingApprovalsScreen()),
        GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
        GoRoute(path: '/ussd-settings', builder: (_, __) => const UssdSettingsScreen()),
        GoRoute(path: '/community', builder: (_, __) => const CommunityFeedScreen()),
        GoRoute(
          path: '/community/post/:post_id',
          builder: (_, state) => PostDetailScreen(postId: state.pathParameters['post_id']!),
        ),
        GoRoute(path: '/community/moderation', builder: (_, __) => const PostModerationScreen()),

        // Reports
        GoRoute(path: '/reports', builder: (_, __) => const ReportsScreen()),

        // AI Assistant
        GoRoute(path: '/ai', builder: (_, __) => const AIAssistantScreen()),

        // Subscription
        GoRoute(path: '/subscription', builder: (_, __) => const SubscriptionScreen()),

        // Marketplace
        GoRoute(path: '/marketplace', builder: (_, __) => const MarketplaceScreen()),
        GoRoute(path: '/marketplace/post', builder: (_, __) => const PostAdScreen()),
        GoRoute(path: '/marketplace/mine', builder: (_, __) => const MyAdsScreen()),
        GoRoute(
          path: '/marketplace/ads/:ad_id',
          builder: (_, state) => AdDetailScreen(adId: state.pathParameters['ad_id']!),
        ),

        // Branches (standalone deep link — owners use the in-dashboard tab instead)
        GoRoute(path: '/branches', builder: (_, __) => const BranchesScreen()),

        // Staff management (business owner only — enforced server-side)
        GoRoute(path: '/users', builder: (_, __) => const StaffManagementScreen()),

        // Notifications
        GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),

        // Settings
        GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),

        // Root redirect
        GoRoute(path: '/', redirect: (context, state) {
          if (authState is AuthAuthenticated) return _homeForRole(authState);
          return '/auth/login';
        }),
      ],
    );
  }

  static String _homeForRole(AuthAuthenticated state) {
    switch (state.user['role']) {
      case 'agent': return '/agent';
      case 'manager': return '/manager';
      case 'business_owner': return '/owner';
      case 'auditor': return '/owner'; // auditor uses owner view (read-only)
      default: return '/agent';
    }
  }
}
