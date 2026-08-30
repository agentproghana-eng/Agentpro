const {
  REQUEST_STATUSES,
  normalizeApproximateLocation,
  buildProximityBoundingBox,
  isWithinMutualRadius,
  canTransition,
  assertTransition,
} = require(
  '../../src/services/communityServiceRequestService'
);

describe(
  'Community service request domain',
  () => {
    test(
      'defines the canonical seven-stage lifecycle',
      () => {
        expect(
          REQUEST_STATUSES
        ).toEqual([
          'requested',
          'providers_found',
          'offers_received',
          'provider_selected',
          'in_progress',
          'completed',
          'reviewed',
        ]);
      }
    );

    test(
      'allows canonical forward transitions',
      () => {
        const allowed = [
          [
            'requested',
            'providers_found',
          ],
          [
            'requested',
            'offers_received',
          ],
          [
            'providers_found',
            'offers_received',
          ],
          [
            'offers_received',
            'provider_selected',
          ],
          [
            'provider_selected',
            'in_progress',
          ],
          [
            'in_progress',
            'completed',
          ],
          [
            'completed',
            'reviewed',
          ],
        ];

        for (
          const [
            fromStatus,
            toStatus,
          ] of allowed
        ) {
          expect(
            canTransition(
              fromStatus,
              toStatus
            )
          ).toBe(true);
        }
      }
    );

    test(
      'rejects backwards and invalid transitions',
      () => {
        expect(
          canTransition(
            'reviewed',
            'requested'
          )
        ).toBe(false);

        expect(
          canTransition(
            'completed',
            'provider_selected'
          )
        ).toBe(false);

        expect(() =>
          assertTransition(
            'completed',
            'provider_selected'
          )
        ).toThrow(
          /Invalid service request transition/
        );
      }
    );

    test(
      'reduces incoming coordinates to approximate precision',
      () => {
        expect(
          normalizeApproximateLocation(
            5.603716,
            -0.186964
          )
        ).toEqual({
          approxLatitude: 5.6,
          approxLongitude: -0.19,
        });
      }
    );

    test(
      'rejects invalid coordinate ranges',
      () => {
        expect(() =>
          normalizeApproximateLocation(
            91,
            0
          )
        ).toThrow(
          /Latitude/
        );

        expect(() =>
          normalizeApproximateLocation(
            5,
            -181
          )
        ).toThrow(
          /Longitude/
        );
      }
    );

    test(
      'builds a bounded proximity prefilter',
      () => {
        const box =
          buildProximityBoundingBox(
            5.6,
            -0.19,
            20
          );

        expect(
          box.minLatitude
        ).toBeLessThan(5.6);

        expect(
          box.maxLatitude
        ).toBeGreaterThan(5.6);

        expect(
          box.minLongitude
        ).toBeLessThan(-0.19);

        expect(
          box.maxLongitude
        ).toBeGreaterThan(-0.19);

        expect(
          box.crossesAntimeridian
        ).toBe(false);
      }
    );

    test(
      'handles antimeridian proximity safely',
      () => {
        const box =
          buildProximityBoundingBox(
            0,
            179.95,
            50
          );

        expect(
          box.crossesAntimeridian
        ).toBe(true);

        expect(
          box.minLongitude
        ).toBeGreaterThan(179);

        expect(
          box.maxLongitude
        ).toBeLessThan(-179);
      }
    );

    test(
      'requires distance to satisfy both radii',
      () => {
        expect(
          isWithinMutualRadius(
            4,
            5,
            20
          )
        ).toBe(true);

        expect(
          isWithinMutualRadius(
            7,
            5,
            20
          )
        ).toBe(false);

        expect(
          isWithinMutualRadius(
            12,
            30,
            10
          )
        ).toBe(false);

        expect(
          isWithinMutualRadius(
            10,
            10,
            10
          )
        ).toBe(true);
      }
    );

    test(
      'fails closed on malformed proximity inputs',
      () => {
        expect(
          isWithinMutualRadius(
            'bad',
            10,
            10
          )
        ).toBe(false);

        expect(
          isWithinMutualRadius(
            2,
            0,
            10
          )
        ).toBe(false);

        expect(
          isWithinMutualRadius(
            -1,
            10,
            10
          )
        ).toBe(false);
      }
    );
    test(
      'contains Haversine boundary points inside the population prefilter',
      () => {
        const earthRadiusKm =
          6371;

        const radiusKm =
          50;

        const toRadians =
          (degrees) =>
            degrees *
            Math.PI /
            180;

        const toDegrees =
          (radians) =>
            radians *
            180 /
            Math.PI;

        const normalizeLongitude =
          (longitude) =>
            (
              (
                longitude +
                540
              ) %
              360
            ) -
            180;

        const destination =
          (
            latitude,
            longitude,
            bearingDegrees
          ) => {
            const angularDistance =
              radiusKm /
              earthRadiusKm;

            const latitude1 =
              toRadians(
                latitude
              );

            const longitude1 =
              toRadians(
                longitude
              );

            const bearing =
              toRadians(
                bearingDegrees
              );

            const latitude2 =
              Math.asin(
                Math.sin(
                  latitude1
                ) *
                Math.cos(
                  angularDistance
                ) +
                Math.cos(
                  latitude1
                ) *
                Math.sin(
                  angularDistance
                ) *
                Math.cos(
                  bearing
                )
              );

            const longitude2 =
              longitude1 +
              Math.atan2(
                Math.sin(
                  bearing
                ) *
                Math.sin(
                  angularDistance
                ) *
                Math.cos(
                  latitude1
                ),
                Math.cos(
                  angularDistance
                ) -
                Math.sin(
                  latitude1
                ) *
                Math.sin(
                  latitude2
                )
              );

            return {
              latitude:
                toDegrees(
                  latitude2
                ),
              longitude:
                normalizeLongitude(
                  toDegrees(
                    longitude2
                  )
                ),
            };
          };

        const longitudeInside =
          (
            longitude,
            box
          ) => {
            if (
              box.minLongitude ===
                -180 &&
              box.maxLongitude ===
                180
            ) {
              return true;
            }

            if (
              box.crossesAntimeridian
            ) {
              return (
                longitude >=
                  box.minLongitude ||
                longitude <=
                  box.maxLongitude
              );
            }

            return (
              longitude >=
                box.minLongitude &&
              longitude <=
                box.maxLongitude
            );
          };

        for (
          const latitude of [
            0,
            60,
            88,
          ]
        ) {
          const box =
            buildProximityBoundingBox(
              latitude,
              0,
              radiusKm
            );

          for (
            const bearing of [
              0,
              90,
              180,
              270,
            ]
          ) {
            const point =
              destination(
                latitude,
                0,
                bearing
              );

            expect(
              point.latitude
            ).toBeGreaterThanOrEqual(
              box.minLatitude -
                1e-12
            );

            expect(
              point.latitude
            ).toBeLessThanOrEqual(
              box.maxLatitude +
                1e-12
            );

            expect(
              longitudeInside(
                point.longitude,
                box
              )
            ).toBe(true);
          }
        }
      }
    );

    test(
      'uses all longitudes when the buffered search reaches a pole',
      () => {
        const box =
          buildProximityBoundingBox(
            89.8,
            20,
            50
          );

        expect(
          box.minLongitude
        ).toBe(-180);

        expect(
          box.maxLongitude
        ).toBe(180);

        expect(
          box.crossesAntimeridian
        ).toBe(false);
      }
    );

  }
);
