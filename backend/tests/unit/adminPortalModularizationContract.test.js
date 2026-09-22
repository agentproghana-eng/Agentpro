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
      'extracted Marketplace page avoids circular pages import',
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
  },
);
