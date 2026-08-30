const fs = require('fs');
const path = require('path');

describe(
  'Community service request schema contract',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../migrations/106_community_service_requests.sql'
        ),
        'utf8'
      );

    test(
      'persists the canonical lifecycle',
      () => {
        for (
          const status of [
            'requested',
            'providers_found',
            'offers_received',
            'provider_selected',
            'in_progress',
            'completed',
            'reviewed',
          ]
        ) {
          expect(
            source
          ).toContain(
            `'${status}'`
          );
        }
      }
    );

    test(
      'stores approximate coordinates rather than exact address fields',
      () => {
        expect(
          source
        ).toContain(
          'approx_latitude'
        );

        expect(
          source
        ).toContain(
          'approx_longitude'
        );

        expect(
          source
        ).not.toMatch(
          /\bexact_latitude\b/
        );

        expect(
          source
        ).not.toMatch(
          /\bexact_longitude\b/
        );

        expect(
          source
        ).not.toMatch(
          /\bstreet_address\b/
        );

        expect(
          source
        ).not.toMatch(
          /\bresidential_address\b/
        );
      }
    );

    test(
      'keeps requests separate from advertisements',
      () => {
        expect(
          source
        ).toContain(
          'community_service_requests'
        );

        expect(
          source
        ).toContain(
          'community_service_offers'
        );

        expect(
          source
        ).not.toContain(
          'REFERENCES advertisements'
        );
      }
    );

    test(
      'records auditable lifecycle events',
      () => {
        for (
          const value of [
            'community_service_request_events',
            'actor_user_id',
            'from_status',
            'to_status',
            'event_type',
          ]
        ) {
          expect(
            source
          ).toContain(value);
        }
      }
    );
    test(
      'indexes location-aware request discovery',
      () => {
        expect(
          source
        ).toContain(
          'idx_community_service_request_location'
        );

        expect(
          source
        ).toContain(
          'approx_latitude'
        );

        expect(
          source
        ).toContain(
          'approx_longitude'
        );
      }
    );

    test(
      'keeps moderation separate from service lifecycle',
      () => {
        expect(
          source
        ).toContain(
          'content_status'
        );

        expect(
          source
        ).toContain(
          "'active'"
        );

        expect(
          source
        ).toContain(
          "'pending_review'"
        );

        expect(
          source
        ).toContain(
          "'removed'"
        );

        expect(
          source
        ).toContain(
          'community_service_request_moderation_history'
        );
      }
    );

    test(
      'reuses the established Community report contract',
      () => {
        expect(
          source
        ).toContain(
          'community_service_request_reports'
        );

        for (
          const status of [
            'pending',
            'reviewed',
            'dismissed',
            'actioned',
          ]
        ) {
          expect(
            source
          ).toContain(
            `'${status}'`
          );
        }

        for (
          const reason of [
            'spam',
            'fraud',
            'harassment',
            'misinformation',
            'inappropriate',
            'privacy',
            'other',
          ]
        ) {
          expect(
            source
          ).toContain(
            `'${reason}'`
          );
        }
      }
    );

    test(
      'indexes visible service discovery separately',
      () => {
        expect(
          source
        ).toContain(
          'idx_community_service_visible_discovery'
        );

        expect(
          source
        ).toContain(
          "WHERE content_status = 'active'"
        );
      }
    );

  }
);
