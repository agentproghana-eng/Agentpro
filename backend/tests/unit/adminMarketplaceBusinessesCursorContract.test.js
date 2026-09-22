'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath,
    ),
    'utf8',
  );
}

const routes =
  read('src/routes/admin.routes.js');

const authorization =
  read(
    'src/middleware/adminAuthorization.js',
  );

const migration =
  read(
    'migrations/144_admin_marketplace_business_cursor_indexes.sql',
  );

const marketplacePage =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../..',
      'admin_portal/src/features/marketplace/MarketplaceBusinessesPage.jsx',
    ),
    'utf8',
  );

describe(
  'Admin Marketplace Businesses cursor contract',
  () => {
    test(
      'adds cursor route before preserving legacy route',
      () => {
        const cursorIndex =
          routes.indexOf(
            "router.get(\n  '/marketplace-businesses/cursor'",
          );

        const legacyIndex =
          routes.indexOf(
            "router.get('/marketplace-businesses',",
          );

        expect(cursorIndex)
          .toBeGreaterThanOrEqual(0);

        expect(legacyIndex)
          .toBeGreaterThan(
            cursorIndex,
          );
      },
    );

    test(
      'pages companies before expensive seller metrics',
      () => {
        const start =
          routes.indexOf(
            "router.get(\n  '/marketplace-businesses/cursor'",
          );

        const end =
          routes.indexOf(
            "// Legacy unbounded route retained for compatibility.",
            start,
          );

        const cursorRoute =
          routes.slice(start, end);

        expect(cursorRoute)
          .toContain(
            'WITH page_companies',
          );

        expect(cursorRoute)
          .toContain(
            'AS MATERIALIZED',
          );

        expect(cursorRoute)
          .toContain(
            'LEFT JOIN LATERAL',
          );

        expect(cursorRoute)
          .toContain(
            'DISTINCT a.id',
          );

        expect(cursorRoute)
          .toContain(
            "'marketplace_seller'",
          );

        expect(cursorRoute)
          .not.toContain(
            'GROUP BY',
          );

        expect(cursorRoute)
          .not.toMatch(
            /\bOFFSET\b/i,
          );
      },
    );

    test(
      'uses deterministic mixed-order cursor indexes',
      () => {
        expect(migration)
          .toContain(
            'idx_companies_admin_marketplace_cursor',
          );

        expect(migration)
          .toContain(
            'marketplace_featured DESC',
          );

        expect(migration)
          .toContain(
            'marketplace_featured_priority DESC',
          );

        expect(migration)
          .toContain(
            'marketplace_verified DESC',
          );

        expect(migration)
          .toContain(
            'name ASC',
          );

        expect(migration)
          .toContain(
            'id ASC',
          );

        expect(migration)
          .toContain(
            'idx_advertisements_company_status_id',
          );

        expect(migration)
          .toContain(
            'idx_subscriptions_company_created_cursor',
          );
      },
    );

    test(
      'keeps cursor route behind content admin permission',
      () => {
        expect(authorization)
          .toContain(
            "pattern: /^\\/marketplace-businesses(?:\\/cursor)?$/",
          );

        expect(authorization)
          .toContain(
            "permission: 'content.manage'",
          );
      },
    );

    test(
      'Admin Marketplace UI uses server search and incremental cursor loading',
      () => {
        const marketplace =
          marketplacePage;

        expect(marketplace)
          .toContain(
            "'/admin/marketplace-businesses/cursor'",
          );

        expect(marketplace)
          .toContain(
            'limit: 50',
          );

        expect(marketplace)
          .toContain(
            'next_cursor',
          );

        expect(marketplace)
          .toContain(
            "'Load more businesses'",
          );

        expect(marketplace)
          .toContain(
            'latestSearchRef',
          );

        expect(marketplace)
          .not.toContain(
            'const filtered = companies.filter',
          );
      },
    );
  },
);
