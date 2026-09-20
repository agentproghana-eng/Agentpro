import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String source(String path) =>
    File(path).readAsStringSync();

void main() {
  group(
    'AgentPro mobile information architecture',
    () {
      test(
        'primary business navigation restores Marketplace as Business Hub',
        () {
          for (final path in [
            'lib/features/dashboard/agent_dashboard.dart',
            'lib/features/dashboard/manager_dashboard.dart',
          ]) {
            final text = source(path);

            for (final label in [
              'Home',
              'Community',
              'Business Hub',
              'More',
            ]) {
              expect(
                text,
                contains("'$label'"),
                reason: path,
              );
            }

            expect(
              text,
              contains(
                'MarketplaceScreen()',
              ),
              reason: path,
            );

            expect(
              text,
              isNot(
                contains(
                  "label: 'Agents Hub'",
                ),
              ),
              reason: path,
            );
          }
        },
      );

      test(
        'Personal Business Hub is Marketplace',
        () {
          final text = source(
            'lib/features/dashboard/personal_dashboard.dart',
          );

          expect(
            text,
            contains(
              'MarketplaceScreen()',
            ),
          );

          expect(
            text,
            isNot(
              contains(
                'BusinessHubScreen()',
              ),
            ),
          );
        },
      );

      test(
        'Agent Hub contains the requested operational set',
        () {
          final text = source(
            'lib/features/business/agents_hub_screen.dart',
          );

          for (final label in [
            'Transaction History',
            'Report & Insight',
            'Float',
            'Shift Reconciliation',
          ]) {
            expect(
              text,
              contains(label),
            );
          }

          expect(
            text,
            isNot(
              contains(
                'Agent Community',
              ),
            ),
          );

          expect(
            text,
            contains(
              'Balance & Request',
            ),
          );
        },
      );

      test(
        'More owns End Session and full Sign Out',
        () {
          for (final path in [
            'lib/features/dashboard/agent_dashboard.dart',
            'lib/features/dashboard/manager_dashboard.dart',
            'lib/features/dashboard/owner_dashboard.dart',
            'lib/features/dashboard/personal_more_tab.dart',
          ]) {
            final text = source(path);

            expect(
              text,
              contains(
                "'End Session'",
              ),
              reason: path,
            );

            expect(
              text,
              contains(
                'AuthLockEvent()',
              ),
              reason: path,
            );

            expect(
              text,
              contains(
                "'Sign Out'",
              ),
              reason: path,
            );

            expect(
              text,
              contains(
                'AuthLogoutEvent()',
              ),
              reason: path,
            );
          }
        },
      );

      test(
        'Settings owns deletion and simplified About',
        () {
          final text = source(
            'lib/features/settings/settings_screen.dart',
          );

          expect(
            text,
            contains(
              "'Account Management'",
            ),
          );

          expect(
            text,
            contains(
              "'Delete Account'",
            ),
          );

          final aboutStart =
              text.indexOf(
            "_SettingsSectionHeader(title: 'About')",
          );

          expect(
            aboutStart,
            greaterThanOrEqualTo(0),
          );

          final about =
              text.substring(
            aboutStart,
          );

          expect(
            about,
            contains(
              "'Privacy Policy'",
            ),
          );

          expect(
            about,
            contains(
              "'Terms and Conditions'",
            ),
          );

          expect(
            about,
            contains(
              "'Version'",
            ),
          );

          expect(
            about,
            isNot(
              contains(
                "'Contact Support'",
              ),
            ),
          );

          expect(
            about,
            isNot(
              contains(
                "_SettingsSectionHeader(title: 'Session')",
              ),
            ),
          );
        },
      );

      test(
        'Help and Support owns Complaints and Feedback',
        () {
          final support = source(
            'lib/features/support/support_screen.dart',
          );

          expect(
            support,
            contains(
              "'Complaints & Feedback'",
            ),
          );

          expect(
            support,
            contains(
              "context.push('/support/feedback')",
            ),
          );

          expect(
            support,
            contains(
              "'My Support Cases'",
            ),
          );

          expect(
            support,
            contains(
              "context.push('/support/cases')",
            ),
          );

          final settings = source(
            'lib/features/settings/settings_screen.dart',
          );

          expect(
            settings,
            isNot(
              contains(
                "'Complaints & Feedback'",
              ),
            ),
          );
        },
      );

      test(
        'Complaints and Feedback is not duplicated under More',
        () {
          for (final path in [
            'lib/features/dashboard/agent_dashboard.dart',
            'lib/features/dashboard/manager_dashboard.dart',
            'lib/features/dashboard/owner_dashboard.dart',
            'lib/features/dashboard/personal_more_tab.dart',
          ]) {
            expect(
              source(path),
              isNot(
                contains(
                  "'Complaints & Feedback'",
                ),
              ),
              reason: path,
            );
          }
        },
      );
    },
  );
}
