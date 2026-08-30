const fs = require('fs');
const path = require('path');

describe(
  'Community service authorization contract',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../src/controllers/communityServiceRequestController.js'
        ),
        'utf8'
      );

    test(
      'requester-owned actions bind to authenticated user',
      () => {
        expect(
          source
        ).toContain(
          'requester_user_id = $2'
        );

        expect(
          source
        ).toContain(
          'req.user.id'
        );
      }
    );

    test(
      'provider actions require provider eligibility',
      () => {
        expect(
          source
        ).toContain(
          "'PROVIDER_CATEGORY_REQUIRED'"
        );

        expect(
          source
        ).toContain(
          "'SELECTED_PROVIDER_REQUIRED'"
        );

        expect(
          source
        ).toContain(
          "'OWN_REQUEST_OFFER_FORBIDDEN'"
        );
      }
    );

    test(
      'offer submission requires mutual proximity',
      () => {
        expect(
          source
        ).toContain(
          'isWithinMutualRadius('
        );

        expect(
          source
        ).toContain(
          'provider.service_radius_km'
        );

        expect(
          source
        ).toContain(
          'serviceRequest.search_radius_km'
        );

        expect(
          source
        ).toContain(
          "'PROVIDER_OUT_OF_RANGE'"
        );
      }
    );

    test(
      'provider request feed respects requester radius too',
      () => {
        expect(
          source
        ).toMatch(
          /WHERE distance_km <= LEAST\([\s\S]*search_radius_km::double precision/
        );
      }
    );

    test(
      'provider discovery does not select contact information',
      () => {
        expect(
          source
        ).not.toMatch(
          /p\.phone/
        );

        expect(
          source
        ).not.toMatch(
          /p\.email/
        );

        expect(
          source
        ).not.toMatch(
          /exact_latitude/
        );

        expect(
          source
        ).not.toMatch(
          /exact_longitude/
        );
      }
    );
    test(
      'prefilters population queries before Haversine distance',
      () => {
        expect(
          source
        ).toContain(
          'p.approx_latitude BETWEEN'
        );

        expect(
          source
        ).toContain(
          'r.approx_latitude BETWEEN'
        );

        expect(
          source
        ).toContain(
          'crossesAntimeridian'
        );
      }
    );

    test(
      'uses live authoritative identity in discovery and offers',
      () => {
        expect(
          source
        ).toContain(
          'company.status = \'active\''
        );

        expect(
          source
        ).toContain(
          'company.name'
        );

        expect(
          source
        ).toContain(
          'provider_user.first_name'
        );

        expect(
          source
        ).toContain(
          'provider_user.last_name'
        );

        expect(
          source
        ).toContain(
          'provider_company.name'
        );
      }
    );

    test(
      'hides moderated requests from discovery and new offers',
      () => {
        expect(
          source
        ).toContain(
          "r.content_status = 'active'"
        );

        const activeVisibilityFilters =
          source.match(
            /content_status = 'active'/g
          ) || [];

        expect(
          activeVisibilityFilters.length
        ).toBeGreaterThanOrEqual(3);

        expect(
          source
        ).toContain(
          'COMMUNITY_SERVICE_CONTENT_STATUSES'
        );
      }
    );

    test(
      'keeps moderation independent from service lifecycle state',
      () => {
        expect(
          source
        ).toContain(
          'community_service_request_moderation_history'
        );

        expect(
          source
        ).toContain(
          'service_status'
        );

        expect(
          source
        ).toContain(
          'content_status'
        );
      }
    );

  }
);
