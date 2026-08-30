const fs = require('fs');
const path = require('path');

describe(
  'Community service routes contract',
  () => {
    const routeSource =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../src/routes/communityServiceRequest.routes.js'
        ),
        'utf8'
      );

    const serverSource =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../server.js'
        ),
        'utf8'
      );

    test(
      'requires authenticated AgentPro sessions',
      () => {
        expect(
          routeSource
        ).toContain(
          'router.use(authenticate);'
        );
      }
    );

    test(
      'keeps Community Services separate from existing domains',
      () => {
        expect(
          serverSource
        ).toContain(
          '`${API}/community-services`'
        );

        expect(
          serverSource
        ).toContain(
          '`${API}/personal-community`'
        );

        expect(
          serverSource
        ).toContain(
          '`${API}/marketplace`'
        );
      }
    );

    test(
      'exposes requester and provider lifecycle actions',
      () => {
        const required = [
          "'/categories'",
          "'/provider/profile'",
          "'/provider/requests'",
          "'/requests'",
          "'/requests/:request_id/discover'",
          "'/requests/:request_id/offers'",
          "'/requests/:request_id/offers/:offer_id/select'",
          "'/requests/:request_id/start'",
          "'/requests/:request_id/complete'",
          "'/requests/:request_id/review'",
        ];

        for (
          const route of required
        ) {
          expect(
            routeSource
          ).toContain(route);
        }
      }
    );

    test(
      'validates proximity and identifiers',
      () => {
        const required = [
          "body('latitude')",
          "body('longitude')",
          "body('search_radius_km')",
          "body('service_radius_km')",
          "param('request_id')",
          "param('offer_id')",
        ];

        for (
          const value of required
        ) {
          expect(
            routeSource
          ).toContain(value);
        }
      }
    );
    test(
      'does not accept client-controlled provider identity',
      () => {
        expect(
          routeSource
        ).not.toContain(
          "body('display_name')"
        );

        expect(
          routeSource
        ).not.toContain(
          "body('business_name')"
        );
      }
    );

    test(
      'allows authenticated request reporting',
      () => {
        expect(
          routeSource
        ).toContain(
          "'/requests/:request_id/report'"
        );

        expect(
          routeSource
        ).toContain(
          'controller.reportRequest'
        );
      }
    );

    test(
      'restricts service-request moderation to superuser',
      () => {
        expect(
          routeSource
        ).toContain(
          "'/moderation/reports'"
        );

        expect(
          routeSource
        ).toContain(
          "'/moderation/requests/:request_id'"
        );

        expect(
          routeSource.match(
            /authorize\('superuser'\)/g
          ) || []
        ).toHaveLength(3);
      }
    );

  }
);
