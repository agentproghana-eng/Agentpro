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
  'Admin Support Console modularization contract',
  () => {
    const app =
      read('admin_portal/src/App.jsx');

    const shell =
      read(
        'admin_portal/src/features/support/SupportConsolePage.jsx',
      );

    const fraud =
      read(
        'admin_portal/src/features/support/FraudSignalQueue.jsx',
      );

    const timeline =
      read(
        'admin_portal/src/features/support/SupportTimelineInvestigation.jsx',
      );

    test(
      'Support Console is removed from App.jsx and composed from focused modules',
      () => {
        expect(app)
          .not.toContain(
            'function SupportConsolePage()',
          );

        expect(app)
          .toContain(
            "from './features/support/SupportConsolePage.jsx'",
          );

        expect(shell)
          .toContain(
            'export function SupportConsolePage()',
          );

        expect(shell)
          .toContain(
            '<SupportCasesPanel />',
          );

        expect(shell)
          .toContain(
            '<FraudSignalQueue />',
          );

        expect(shell)
          .toContain(
            '<SupportTimelineInvestigation />',
          );
      },
    );

    test(
      'fraud review remains bounded advisory and explicit',
      () => {
        expect(fraud)
          .toContain(
            "'/admin/fraud-signals'",
          );

        expect(fraud)
          .toContain(
            'limit: 50',
          );

        expect(fraud)
          .toContain(
            '`/admin/fraud-signals/${signalId}/review`',
          );

        expect(fraud)
          .toContain(
            "'reviewed'",
          );

        expect(fraud)
          .toContain(
            "'dismissed'",
          );

        expect(fraud)
          .toContain(
            "'escalated'",
          );

        expect(fraud)
          .toContain(
            'does not block users or',
          );
      },
    );

    test(
      'timeline investigator preserves exact privacy-safe support search',
      () => {
        expect(timeline)
          .toContain(
            "'/admin/support/timeline'",
          );

        expect(timeline)
          .toContain(
            'Search privacy-safe',
          );

        expect(timeline)
          .toContain(
            'Raw PINs, OTPs, tokens,',
          );

        expect(timeline)
          .toContain(
            'Searches are exact and',
          );

        expect(timeline)
          .toContain(
            "'transaction.failed'",
          );

        expect(timeline)
          .toContain(
            "'transaction.pending_confirmation'",
          );

        expect(timeline)
          .toContain(
            'Case Summary',
          );

        expect(timeline)
          .toContain(
            'Operational Timeline',
          );
      },
    );

    test(
      'support data modules use shared API and avoid circular imports',
      () => {
        for (
          const feature of [
            fraud,
            timeline,
          ]
        ) {
          expect(feature)
            .toContain(
              "from '../../lib/api.js'",
            );

          expect(feature)
            .not.toContain(
              "from '../../App.jsx'",
            );

          expect(feature)
            .not.toContain(
              "from 'axios'",
            );
        }

        expect(shell)
          .not.toContain(
            "from '../../lib/api.js'",
          );

        expect(shell)
          .not.toContain(
            "from '../../App.jsx'",
          );
      },
    );

    test(
      'App.jsx drops below the support decomposition threshold',
      () => {
        expect(
          app.split('\n').length,
        ).toBeLessThan(3300);
      },
    );
  },
);
