import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_bloc.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/auth/account_type_selection_screen.dart';
import '../../features/auth/personal_register_screen.dart';
import '../../features/auth/forgot_password_screen.dart';
import '../../features/auth/force_password_change_screen.dart';
import '../../features/dashboard/agent_dashboard.dart';
import '../../features/dashboard/manager_dashboard.dart';
import '../../features/dashboard/owner_dashboard.dart';
import '../../features/transactions/transaction_screen.dart';
import '../../features/transactions/transaction_progress_screen.dart';
import '../../features/transactions/transaction_detail_screen.dart';
import '../../features/transactions/transaction_history_screen.dart';
import '../../features/sync/sync_queue_screen.dart';
import '../../features/float/float_screen.dart';
import '../../features/float/float_overview_screen.dart';
import '../../features/balances/my_balance_screen.dart';
import '../../features/balances/float_received_screen.dart';
import '../../features/balances/commission_transfer_screen.dart';
import '../../features/balances/cash_adjustment_screen.dart';
import '../../features/balances/pending_approvals_screen.dart';
import '../../features/support/support_screen.dart';
import '../../features/support/help_guide_screen.dart';
import '../../features/dashboard/personal_dashboard.dart';
import '../../features/transactions/personal_transaction_screen.dart';
import '../../features/subscription/personal_subscription_screen.dart';
import '../../features/personal_community/personal_community_feed_screen.dart';
import '../../features/personal_community/personal_post_detail_screen.dart';
import '../../features/reports/personal_reports_screen.dart';
import '../../features/transactions/personal_transaction_history_screen.dart';
import '../../features/ussd_settings/ussd_settings_screen.dart';
import '../../features/ussd_settings/quick_action_customization_screen.dart';
import '../../features/ussd_flows/ussd_flow_list_screen.dart';
import '../../features/community/community_feed_screen.dart';
import '../../features/shifts/close_shift_screen.dart';
import '../../features/shifts/shift_history_screen.dart';
import '../../features/community/post_detail_screen.dart';
import '../../features/community/post_moderation_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/ai_assistant/ai_assistant_screen.dart';
import '../../features/subscription/subscription_screen.dart';
import '../../features/business/business_hub_screen.dart';
import '../../features/marketplace/marketplace_screen.dart';
import '../../features/marketplace/post_ad_screen.dart';
import '../../features/marketplace/my_ads_screen.dart';
import '../../features/marketplace/ad_detail_screen.dart';
import '../../features/marketplace/seller_storefront_screen.dart';
import '../../features/marketplace/customer_reviews_screen.dart';
import '../../features/marketplace/saved_ads_screen.dart';
import '../../features/marketplace/marketplace_enquiries_screen.dart';
import '../../features/marketplace/marketplace_conversation_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/settings/sim_purpose_settings_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/branches/branches_screen.dart';
import '../../features/staff/staff_management_screen.dart';

// Shared with HomeTab (via RouteAware) so it can detect returning from
// a pushed screen like Settings > SIM Purpose, and refresh accordingly -
// HomeTab lives inside an IndexedStack that never rebuilds on tab
// switches, so this is the only reliable 'you're visible again' signal.
final RouteObserver<PageRoute> routeObserver = RouteObserver<PageRoute>();

class AppRouter {
  static GoRouter createRouter(
    AuthBloc authBloc, {
    required Listenable refreshListenable,
  }) {
    return GoRouter(
      refreshListenable: refreshListenable,
      errorBuilder: (context, state) => AppRouteErrorScreen(
        message: state.error?.toString() ?? 'Page not found',
        location: state.uri.toString(),
      ),
      initialLocation: '/',
      observers: [routeObserver],
      redirect: (context, state) {
        final authState = authBloc.state;
        final isLoggedIn = authState is AuthAuthenticated;
        final isAuthRoute = state.matchedLocation.startsWith('/auth');
        final mustChangePassword =
            isLoggedIn && authState.user['must_change_password'] == true;
        final isForcedChangeRoute =
            state.matchedLocation == '/auth/change-password-required';

        if (!isLoggedIn && !isAuthRoute) {
          return '/auth/login';
        }

        if (mustChangePassword && !isForcedChangeRoute) {
          return '/auth/change-password-required';
        }

        if (isLoggedIn && !mustChangePassword && isAuthRoute) {
          return _homeForRole(authState);
        }

        if (authState is AuthAuthenticated) {
          final role = authState.user['role']?.toString();
          final location = state.matchedLocation;

          if (location == '/agent' && role != 'agent') {
            return _homeForRole(authState);
          }

          if (location == '/manager' && role != 'manager') {
            return _homeForRole(authState);
          }

          if (location == '/owner' &&
              role != 'business_owner' &&
              role != 'auditor') {
            return _homeForRole(authState);
          }

          if ((location == '/users' || location == '/branches') &&
              role != 'business_owner') {
            return _homeForRole(authState);
          }
        }

        return null;
      },
      routes: [
        // Auth routes
        GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
        GoRoute(
            path: '/auth/register', builder: (_, __) => const RegisterScreen()),
        GoRoute(
            path: '/auth/account-type',
            builder: (_, __) => const AccountTypeSelectionScreen()),
        GoRoute(
            path: '/auth/register-personal',
            builder: (_, __) => const PersonalRegisterScreen()),
        GoRoute(
            path: '/auth/change-password-required',
            builder: (_, __) => const ForcePasswordChangeScreen()),
        GoRoute(
            path: '/auth/forgot-password',
            builder: (_, __) => const ForgotPasswordScreen()),

        // Role dashboards
        GoRoute(path: '/agent', builder: (_, __) => const AgentDashboard()),
        GoRoute(path: '/manager', builder: (_, __) => const ManagerDashboard()),
        GoRoute(path: '/owner', builder: (_, __) => const OwnerDashboard()),

        // Transactions
        GoRoute(
          path: '/transactions',
          builder: (_, state) {
            final type = state.uri.queryParameters['type'] ?? 'cash_in';
            final provider = state.uri.queryParameters['provider'];
            return TransactionScreen(
                transactionType: type, initialProvider: provider);
          },
        ),
        GoRoute(
          path: '/personal-transactions/new',
          builder: (_, state) {
            final type =
                state.uri.queryParameters['type'] ?? 'send_money_same_network';
            final provider = state.uri.queryParameters['provider'] ?? 'mtn';
            final simSlotStr = state.uri.queryParameters['sim_slot'];
            final simIccid = state.uri.queryParameters['sim_iccid'];
            return PersonalTransactionScreen(
              transactionType: type,
              provider: provider,
              simSlot: simSlotStr != null ? int.tryParse(simSlotStr) : null,
              simIccid: simIccid,
            );
          },
        ),
        GoRoute(
          path: '/transactions/progress',
          builder: (_, state) {
            final extra = state.extra;

            if (extra is! Map<String, dynamic>) {
              return const AppRouteErrorScreen(
                message: 'Transaction details are missing.',
                location: '/transactions/progress',
              );
            }

            return TransactionProgressScreen(
              data: extra,
              isPersonal: extra['is_personal'] == true,
            );
          },
        ),
        GoRoute(
            path: '/transactions/history',
            builder: (_, __) => const TransactionHistoryScreen()),
        GoRoute(
          path: '/transactions/:id',
          builder: (_, state) => TransactionDetailScreen(
              transactionId: state.pathParameters['id']!),
        ),
        GoRoute(path: '/sync', builder: (_, __) => const SyncQueueScreen()),

        // Float
        GoRoute(
            path: '/float',
            builder: (_, state) =>
                FloatScreen(branchId: state.uri.queryParameters['branch_id'])),
        GoRoute(
            path: '/float-overview',
            builder: (_, __) => const FloatOverviewScreen()),
        GoRoute(
            path: '/my-balance', builder: (_, __) => const MyBalanceScreen()),
        GoRoute(
          path: '/balances/float-received',
          builder: (_, state) {
            final provider = _providerFromExtra(state.extra);

            if (provider == null) {
              return const AppRouteErrorScreen(
                message: 'A provider is required.',
                location: '/balances/float-received',
              );
            }

            return FloatReceivedScreen(initialProvider: provider);
          },
        ),
        GoRoute(
          path: '/balances/commission-transfer',
          builder: (_, state) {
            final provider = _providerFromExtra(state.extra);

            if (provider == null) {
              return const AppRouteErrorScreen(
                message: 'A provider is required.',
                location: '/balances/commission-transfer',
              );
            }

            return CommissionTransferScreen(provider: provider);
          },
        ),
        GoRoute(
          path: '/balances/cash-adjustment',
          builder: (_, state) {
            final provider = _providerFromExtra(state.extra);

            if (provider == null) {
              return const AppRouteErrorScreen(
                message: 'A provider is required.',
                location: '/balances/cash-adjustment',
              );
            }

            return CashAdjustmentScreen(provider: provider);
          },
        ),
        GoRoute(
            path: '/balances/pending-approvals',
            builder: (_, __) => const PendingApprovalsScreen()),
        GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
        GoRoute(
            path: '/help-guide', builder: (_, __) => const HelpGuideScreen()),
        GoRoute(
            path: '/personal-home',
            builder: (_, __) => const PersonalDashboard()),
        GoRoute(
            path: '/personal-subscription',
            builder: (_, __) => const PersonalSubscriptionScreen()),
        GoRoute(
          path: '/ussd-settings',
          builder: (_, __) => const UssdSettingsScreen(),
        ),
        GoRoute(
          path: '/personal-ussd-settings',
          builder: (_, __) => UssdSettingsScreen(
            transactionTypes: kPersonalTransactionLabels.keys.toList(),
            isPersonal: true,
          ),
        ),
        GoRoute(
          path: '/agent-quick-actions',
          builder: (_, __) => const QuickActionCustomizationScreen(
            isPersonal: false,
          ),
        ),
        GoRoute(
          path: '/personal-quick-actions',
          builder: (_, __) => const QuickActionCustomizationScreen(
            isPersonal: true,
          ),
        ),
        GoRoute(
            path: '/ussd-flows',
            builder: (_, __) => const UssdFlowListScreen()),
        GoRoute(
            path: '/personal-ussd-flows',
            builder: (_, __) => const UssdFlowListScreen(isPersonal: true)),
        GoRoute(
            path: '/community',
            builder: (_, __) => const CommunityFeedScreen()),
        GoRoute(
            path: '/shifts/close/:shiftId',
            builder: (_, state) =>
                CloseShiftScreen(shiftId: state.pathParameters['shiftId']!)),
        GoRoute(
            path: '/shifts/history',
            builder: (_, __) => const ShiftHistoryScreen()),
        GoRoute(
          path: '/community/post/:post_id',
          builder: (_, state) =>
              PostDetailScreen(postId: state.pathParameters['post_id']!),
        ),
        GoRoute(
            path: '/personal-reports',
            builder: (_, __) => const PersonalReportsScreen()),
        GoRoute(
            path: '/personal-transactions/history',
            builder: (_, __) => const PersonalTransactionHistoryScreen()),
        GoRoute(
            path: '/personal-community',
            builder: (_, __) => const PersonalCommunityFeedScreen()),
        GoRoute(
          path: '/personal-community/post/:post_id',
          builder: (_, state) => PersonalPostDetailScreen(
              postId: state.pathParameters['post_id']!),
        ),
        GoRoute(
            path: '/community/moderation',
            builder: (_, __) => const PostModerationScreen()),

        // Reports
        GoRoute(path: '/reports', builder: (_, __) => const ReportsScreen()),

        // AI Assistant
        GoRoute(path: '/ai', builder: (_, __) => const AIAssistantScreen()),

        // Subscription
        GoRoute(
            path: '/subscription',
            builder: (_, __) => const SubscriptionScreen()),

        // Marketplace
        GoRoute(
            path: '/marketplace',
            builder: (_, __) => const MarketplaceScreen()),
        GoRoute(
            path: '/marketplace/more',
            builder: (_, __) => const BusinessHubScreen()),
        GoRoute(
            path: '/marketplace/post',
            builder: (_, __) => const PostAdScreen()),
        GoRoute(
            path: '/marketplace/mine', builder: (_, __) => const MyAdsScreen()),
        GoRoute(
          path: '/marketplace/reviews',
          builder: (_, __) => const CustomerReviewsScreen(),
        ),
        GoRoute(
          path: '/marketplace/saved',
          builder: (_, __) => const SavedAdsScreen(),
        ),
        GoRoute(
          path: '/marketplace/enquiries',
          builder: (_, __) => const MarketplaceEnquiriesScreen(),
        ),
        GoRoute(
          path: '/marketplace/enquiries/:conversation_id',
          builder: (_, state) => MarketplaceConversationScreen(
            conversationId: state.pathParameters['conversation_id']!,
          ),
        ),
        GoRoute(
          path: '/marketplace/sellers/:seller_id',
          builder: (_, state) => SellerStorefrontScreen(
            sellerId: state.pathParameters['seller_id']!,
          ),
        ),
        GoRoute(
          path: '/marketplace/ads/:ad_id',
          builder: (_, state) =>
              AdDetailScreen(adId: state.pathParameters['ad_id']!),
        ),

        // Branches (standalone deep link — owners use the in-dashboard tab instead)
        GoRoute(path: '/branches', builder: (_, __) => const BranchesScreen()),

        // Staff management (business owner only — enforced server-side)
        GoRoute(
            path: '/users', builder: (_, __) => const StaffManagementScreen()),

        // Notifications
        GoRoute(
            path: '/notifications',
            builder: (_, __) => const NotificationsScreen()),

        // Settings
        GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
        GoRoute(
            path: '/settings/sim-purpose',
            builder: (_, __) => const SimPurposeSettingsScreen()),

        GoRoute(
          path: '/unsupported-account',
          builder: (_, __) => const AppRouteErrorScreen(
            message: 'This account role is not supported by the mobile app. '
                'Please contact Agent Pro Ghana support.',
            location: '/unsupported-account',
            showBackButton: false,
          ),
        ),

        // Root redirect
        GoRoute(
          path: '/',
          redirect: (context, state) {
            final authState = authBloc.state;

            if (authState is AuthAuthenticated) {
              return _homeForRole(authState);
            }

            return '/auth/login';
          },
        ),
      ],
    );
  }

  static String _homeForRole(AuthAuthenticated state) {
    switch (state.user['role']) {
      case 'agent':
        return '/agent';
      case 'manager':
        return '/manager';
      case 'business_owner':
        return '/owner';
      case 'auditor':
        return '/owner'; // auditor uses owner view (read-only)
      case 'customer':
        return '/personal-home';
      default:
        return '/unsupported-account';
    }
  }
}

String? _providerFromExtra(Object? extra) {
  if (extra is! Map) return null;

  final provider = extra['provider'];

  if (provider is! String || provider.trim().isEmpty) {
    return null;
  }

  return provider.trim();
}

class AuthRouterRefreshNotifier extends ChangeNotifier {
  AuthRouterRefreshNotifier(Stream<AuthState> stream) {
    _subscription = stream.listen((_) {
      notifyListeners();
    });
  }

  late final StreamSubscription<AuthState> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

class AppRouteErrorScreen extends StatelessWidget {
  const AppRouteErrorScreen({
    super.key,
    required this.message,
    required this.location,
    this.showBackButton = true,
  });

  final String message;
  final String location;
  final bool showBackButton;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: showBackButton,
        title: const Text('Unable to open page'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    semanticLabel: 'Navigation error',
                  ),
                  const SizedBox(height: 20),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    location,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => context.go('/'),
                    child: const Text('Go to home'),
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
