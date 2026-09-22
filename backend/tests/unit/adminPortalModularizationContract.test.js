'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../../..',
      relativePath,
    ),
    'utf8',
  );
}

describe(
  'Admin Portal modularization contract',
  () => {
    const pages =
      read('admin_portal/src/pages.jsx');

    const adminUi =
      read(
        'admin_portal/src/components/AdminUi.jsx',
      );

    const marketplace =
      read(
        'admin_portal/src/features/marketplace/MarketplaceBusinessesPage.jsx',
      );

    const userManagement =
      read(
        'admin_portal/src/features/users/UserManagementPages.jsx',
      );

    const communityModeration =
      read(
        'admin_portal/src/features/community/CommunityModerationPage.jsx',
      );

    test(
      'shared Admin UI primitives live in one reusable module',
      () => {
        for (
          const component of [
            'Badge',
            'Table',
            'PageHeader',
            'StatCard',
          ]
        ) {
          expect(adminUi)
            .toContain(
              `export function ${component}`,
            );

          expect(pages)
            .not.toContain(
              `export function ${component}`,
            );
        }

        expect(pages)
          .toContain(
            "from './components/AdminUi.jsx'",
          );
      },
    );

    test(
      'Marketplace Businesses is extracted and re-exported',
      () => {
        expect(marketplace)
          .toContain(
            'export function MarketplaceBusinessesPage({',
          );

        expect(marketplace)
          .toContain(
            "'/admin/marketplace-businesses/cursor'",
          );

        expect(pages)
          .not.toContain(
            'export function MarketplaceBusinessesPage({',
          );

        expect(pages)
          .toContain(
            "export { MarketplaceBusinessesPage } from './features/marketplace/MarketplaceBusinessesPage.jsx';",
          );
      },
    );

    test(
      'Marketplace feature avoids circular pages import',
      () => {
        expect(marketplace)
          .toContain(
            "from '../../components/AdminUi.jsx'",
          );

        expect(marketplace)
          .toContain(
            "from '../../lib/api.js'",
          );

        expect(marketplace)
          .not.toContain(
            "from '../../pages.jsx'",
          );
      },
    );

    test(
      'user-management pages are extracted and re-exported',
      () => {
        for (
          const page of [
            'CompaniesPage',
            'PersonalUsersPage',
            'CompanyDetailPage',
          ]
        ) {
          expect(userManagement)
            .toContain(
              `export function ${page}()`,
            );

          expect(pages)
            .not.toContain(
              `export function ${page}()`,
            );
        }

        expect(pages)
          .toContain(
            "from './features/users/UserManagementPages.jsx'",
          );
      },
    );

    test(
      'Community Moderation is extracted and re-exported',
      () => {
        expect(communityModeration)
          .toContain(
            'export function CommunityModerationPage()',
          );

        expect(communityModeration)
          .toContain(
            "'/agent-posts/moderation/posts/cursor'",
          );

        expect(communityModeration)
          .toContain(
            "'/personal-community/moderation/pending'",
          );

        expect(pages)
          .not.toContain(
            'export function CommunityModerationPage()',
          );

        expect(pages)
          .toContain(
            "from './features/community/CommunityModerationPage.jsx'",
          );
      },
    );

    test(
      'Community Moderation avoids circular pages imports',
      () => {
        expect(communityModeration)
          .toContain(
            "from '../../components/AdminUi.jsx'",
          );

        expect(communityModeration)
          .toContain(
            "from '../../lib/api.js'",
          );

        expect(communityModeration)
          .not.toContain(
            "from '../../pages.jsx'",
          );
      },
    );

    test(
      'user-management module preserves cursor clients and avoids circular imports',
      () => {
        expect(userManagement)
          .toContain(
            "'/users/cursor'",
          );

        expect(userManagement)
          .toContain(
            'personal_only: true',
          );

        expect(userManagement)
          .toContain(
            'company_id: companyId',
          );

        expect(userManagement)
          .toContain(
            "from '../../components/AdminUi.jsx'",
          );

        expect(userManagement)
          .toContain(
            "from '../../lib/api.js'",
          );

        expect(userManagement)
          .not.toContain(
            "from '../../pages.jsx'",
          );
      },
    );
  },
);
