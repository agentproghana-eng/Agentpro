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
  'Admin Registrations modularization contract',
  () => {
    const app = read('admin_portal/src/App.jsx');
    const registrations = read(
      'admin_portal/src/features/registrations/RegistrationsPage.jsx',
    );

    test(
      'Registrations page is extracted from App.jsx',
      () => {
        expect(registrations).toContain(
          'export function RegistrationsPage()',
        );

        expect(app).not.toContain(
          'function RegistrationsPage()',
        );

        expect(app).toContain(
          "from './features/registrations/RegistrationsPage.jsx'",
        );
      },
    );

    test(
      'registration review behavior remains in the extracted feature',
      () => {
        expect(registrations).toContain(
          "'/admin/pending-registrations'",
        );

        expect(registrations).toContain(
          '/approve`',
        );

        expect(registrations).toContain(
          'Approve and Start 30-Day Free Trial',
        );

        expect(registrations).toContain(
          '<ConfirmDialog',
        );

        expect(registrations).toContain(
          "queryKey: ['admin', 'overview']",
        );
      },
    );

    test(
      'Registrations module uses shared infrastructure and avoids circular imports',
      () => {
        expect(registrations).toContain(
          "from '../../lib/api.js'",
        );

        expect(registrations).toContain(
          "from '../../components/PageState.jsx'",
        );

        expect(registrations).toContain(
          "from '../../components/ConfirmDialog.jsx'",
        );

        expect(registrations).not.toContain(
          "from '../../App.jsx'",
        );

        expect(registrations).not.toContain(
          "from 'axios'",
        );
      },
    );

    test(
      'App.jsx remains modular after subscription extraction',
      () => {
        expect(app.split('\n').length).toBeLessThan(5100);
        expect(app).not.toContain(
          'function SubscriptionsPage()',
        );
        expect(app).toContain(
          "from './features/subscriptions/SubscriptionsPage.jsx'",
        );
      },
    );
  },
);
