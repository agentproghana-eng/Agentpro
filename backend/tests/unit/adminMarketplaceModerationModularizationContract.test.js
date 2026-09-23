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
  'Admin Marketplace moderation modularization contract',
  () => {
    const app =
      read('admin_portal/src/App.jsx');

    const page =
      read(
        'admin_portal/src/features/marketplace/MarketplaceModerationPage.jsx',
      );

    const card =
      read(
        'admin_portal/src/features/marketplace/MarketplaceModerationCard.jsx',
      );

    const viewer =
      read(
        'admin_portal/src/features/marketplace/MarketplacePhotoViewer.jsx',
      );

    const authorization =
      read(
        'backend/src/middleware/adminAuthorization.js',
      );

    test(
      'Marketplace moderation is extracted from App.jsx',
      () => {
        expect(app)
          .not.toContain(
            'function MarketplacePage()',
          );

        expect(app)
          .toContain(
            "from './features/marketplace/MarketplaceModerationPage.jsx'",
          );

        expect(page)
          .toContain(
            'export function MarketplacePage()',
          );

        expect(page)
          .toContain(
            '<MarketplaceModerationCard',
          );

        expect(page)
          .toContain(
            '<MarketplacePhotoViewer',
          );
      },
    );

    test(
      'controller preserves pending queue ordering and moderation API',
      () => {
        expect(page)
          .toContain(
            "'/admin/ads/pending'",
          );

        expect(page)
          .toContain(
            "'pending_payment'",
          );

        expect(page)
          .toContain(
            "'pending_review'",
          );

        expect(page)
          .toContain(
            'left.created_at',
          );

        expect(page)
          .toContain(
            '`/admin/ads/${ad.id}/moderate`',
          );

        expect(page)
          .toContain(
            "'approve_review'",
          );

        expect(page)
          .toContain(
            "'publish'",
          );

        expect(card)
          .toContain(
            "'reject'",
          );
      },
    );

    test(
      'review card preserves assessed pricing and manual payment states',
      () => {
        expect(card)
          .toContain(
            'Admin assessed value',
          );

        expect(card)
          .toContain(
            'Final amount to pay',
          );

        expect(card)
          .toContain(
            'pricing_adjustment_reason',
          );

        expect(card)
          .toContain(
            'Approve & Request',
          );

        expect(card)
          .toContain(
            'Waiting for user payment.',
          );

        expect(card)
          .toContain(
            'Transaction ID:',
          );

        expect(card)
          .toContain(
            'Verify Payment',
          );
      },
    );

    test(
      'review card and viewer preserve complete photo inspection',
      () => {
        expect(card)
          .toContain(
            'Listing photos',
          );

        expect(card)
          .toContain(
            'ad.image_urls',
          );

        expect(card)
          .toContain(
            'Cover image',
          );

        expect(card)
          .toContain(
            'Click to inspect',
          );

        expect(viewer)
          .toContain(
            'Listing photo viewer',
          );

        expect(viewer)
          .toContain(
            'Open original',
          );

        expect(viewer)
          .toContain(
            'Previous',
          );

        expect(viewer)
          .toContain(
            'Next',
          );
      },
    );

    test(
      'Marketplace moderation remains content permission protected',
      () => {
        expect(app)
          .toContain(
            '<AdminPageGuard path="/marketplace">',
          );

        expect(authorization)
          .toContain(
            "pattern: /^\\/ads(?:\\/pending|\\/[^/]+\\/moderate)$/",
          );

        expect(authorization)
          .toContain(
            "permission: 'content.manage'",
          );
      },
    );

    test(
      'Marketplace modules use shared infrastructure without circular imports',
      () => {
        expect(page)
          .toContain(
            "from '../../lib/api.js'",
          );

        for (
          const feature of [
            page,
            card,
            viewer,
          ]
        ) {
          expect(feature)
            .not.toContain(
              "from '../../App.jsx'",
            );

          expect(feature)
            .not.toContain(
              "from 'axios'",
            );
        }
      },
    );

    test(
      'App.jsx drops below the Marketplace decomposition threshold',
      () => {
        expect(
          app.split('\n').length,
        ).toBeLessThan(1800);
      },
    );
  },
);
