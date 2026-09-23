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
  'Admin Config modularization contract',
  () => {
    const app =
      read('admin_portal/src/App.jsx');

    const configPage =
      read(
        'admin_portal/src/features/config/ConfigPage.jsx',
      );

    const adminAuthorization =
      read(
        'backend/src/middleware/adminAuthorization.js',
      );

    const adminRbac =
      read(
        'backend/src/security/adminRbac.js',
      );

    test(
      'Config page is extracted from App.jsx',
      () => {
        expect(configPage)
          .toContain(
            'export function ConfigPage()',
          );

        expect(app)
          .not.toContain(
            'function ConfigPage()',
          );

        expect(app)
          .toContain(
            "from './features/config/ConfigPage.jsx'",
          );
      },
    );

    test(
      'system configuration read and update behavior remains intact',
      () => {
        expect(configPage)
          .toContain(
            "API.get('/admin/config')",
          );

        expect(configPage)
          .toContain(
            'API.patch(`/admin/config/${key}`',
          );

        expect(configPage)
          .toContain(
            "toast.success('Config updated')",
          );

        expect(configPage)
          .toContain(
            "toast.error('Failed to update')",
          );

        expect(configPage)
          .toContain(
            'System Configuration',
          );

        expect(configPage)
          .toContain(
            '>Edit</button>',
          );

        expect(configPage)
          .toContain(
            '>Save</button>',
          );
      },
    );

    test(
      'Config remains behind the existing Admin page guard',
      () => {
        expect(app)
          .toContain(
            'path="/config"',
          );

        expect(app)
          .toContain(
            '<AdminPageGuard path="/config">',
          );

        expect(app)
          .toContain(
            '<ConfigPage />',
          );
      },
    );

    test(
      'server config access remains permission-gated to superuser',
      () => {
        expect(adminAuthorization)
          .toContain(
            "pattern: /^\\/config(?:\\/[^/]+)?$/",
          );

        expect(adminAuthorization)
          .toContain(
            "permission: 'system.config'",
          );

        expect(adminRbac)
          .toContain(
            "superuser: Object.freeze(['*'])",
          );

        for (
          const role of [
            'admin_support',
            'admin_operations',
            'admin_finance',
            'admin_content',
          ]
        ) {
          const start =
            adminRbac.indexOf(
              `${role}: Object.freeze([`,
            );

          expect(start)
            .toBeGreaterThanOrEqual(0);

          const end =
            adminRbac.indexOf(
              ']),',
              start,
            );

          const permissions =
            adminRbac.slice(
              start,
              end,
            );

          expect(permissions)
            .not.toContain(
              "'system.config'",
            );
        }
      },
    );

    test(
      'Config module uses shared API and avoids circular imports',
      () => {
        expect(configPage)
          .toContain(
            "from '../../lib/api.js'",
          );

        expect(configPage)
          .not.toContain(
            "from '../../App.jsx'",
          );

        expect(configPage)
          .not.toContain(
            "from 'axios'",
          );
      },
    );

    test(
      'App.jsx drops below the config extraction threshold',
      () => {
        expect(
          app.split('\n').length,
        ).toBeLessThan(3100);
      },
    );
  },
);
