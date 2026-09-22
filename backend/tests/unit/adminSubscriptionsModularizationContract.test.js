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
  'Admin Subscriptions modularization contract',
  () => {
    const app =
      read('admin_portal/src/App.jsx');

    const subscriptions =
      read(
        'admin_portal/src/features/subscriptions/SubscriptionsPage.jsx',
      );

    test(
      'Subscriptions page is extracted from App.jsx',
      () => {
        expect(subscriptions)
          .toContain(
            'export function SubscriptionsPage()',
          );

        expect(app)
          .not.toContain(
            'function SubscriptionsPage()',
          );

        expect(app)
          .toContain(
            "from './features/subscriptions/SubscriptionsPage.jsx'",
          );
      },
    );

    test(
      'manual Business and Personal payment review stays intact',
      () => {
        expect(subscriptions)
          .toContain(
            "'/subscriptions/pending-payments'",
          );

        expect(subscriptions)
          .toContain(
            "'/personal-subscription/pending-payments'",
          );

        expect(subscriptions)
          .toContain(
            'Approve Payment',
          );

        expect(subscriptions)
          .toContain(
            'Reject Payment',
          );

        expect(subscriptions)
          .toContain(
            "payment.payment_provider === 'manual_momo'",
          );

        expect(subscriptions)
          .toContain(
            '<ConfirmDialog',
          );
      },
    );

    test(
      'Paystack reconciliation remains read-only in Admin',
      () => {
        expect(subscriptions)
          .toContain(
            "'/subscriptions/reconciliation-payments'",
          );

        expect(subscriptions)
          .toContain(
            "'/personal-subscription/reconciliation-payments'",
          );

        expect(subscriptions)
          .toContain(
            'Paystack Reconciliation Required',
          );

        expect(subscriptions)
          .toContain(
            'No approve/reject action is available for',
          );

        expect(subscriptions)
          .toContain(
            'Paystack charges.',
          );
      },
    );

    test(
      'Subscriptions module uses shared infrastructure and avoids circular imports',
      () => {
        expect(subscriptions)
          .toContain(
            "from '../../lib/api.js'",
          );

        expect(subscriptions)
          .toContain(
            "from '../../components/PageState.jsx'",
          );

        expect(subscriptions)
          .toContain(
            "from '../../components/ConfirmDialog.jsx'",
          );

        expect(subscriptions)
          .not.toContain(
            "from '../../App.jsx'",
          );

        expect(subscriptions)
          .not.toContain(
            "from 'axios'",
          );
      },
    );

    test(
      'App.jsx drops below the next modularization threshold',
      () => {
        expect(
          app.split('\n').length,
        ).toBeLessThan(5100);
      },
    );
  },
);
