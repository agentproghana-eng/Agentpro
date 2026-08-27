const fs = require('fs');
const path = require('path');

const {
  TrialDecisionReason,
  assessPersonalTrialEligibility,
  grantPersonalTrial,
  hashPersonalTrialIdentity,
} = require(
  '../../src/services/personalTrialEntitlementService'
);

const PEPPER =
  'agentpro-test-trial-pepper-1234567890abcdef';

const NEW_USER_ID =
  '11111111-1111-4111-8111-111111111111';

const INSTALLATION_ID =
  '22222222-2222-4222-8222-222222222222';

function makeClient(resolver) {
  return {
    query: jest.fn(
      async (sql, params) =>
        resolver(
          String(sql),
          params,
        ),
    ),
  };
}

describe(
  'Personal trial deletion and re-registration',
  () => {
    test(
      'a previously used installation blocks another trial for a new account and new phone',
      async () => {
        const installationClaim =
          hashPersonalTrialIdentity({
            claimType:
              'installation',
            value:
              INSTALLATION_ID,
            pepper: PEPPER,
          });

        const client =
          makeClient(
            async (
              sql,
              params,
            ) => {
              if (
                sql.includes(
                  "c.claim_type = 'phone'"
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                sql.includes(
                  "c.claim_type = 'installation'"
                )
              ) {
                expect(
                  params
                ).toEqual([
                  installationClaim
                    .claimHash,
                  installationClaim
                    .claimVersion,
                ]);

                return {
                  rows: [
                    {
                      id:
                        'historical-entitlement',
                    },
                  ],
                };
              }

              if (
                sql.includes(
                  'INNER JOIN personal_subscriptions'
                )
              ) {
                throw new Error(
                  'Legacy lookup should not run after installation history is found'
                );
              }

              if (
                sql.includes(
                  'INSERT INTO personal_trial_entitlements'
                )
              ) {
                throw new Error(
                  'A reused installation must never receive a new entitlement'
                );
              }

              return {
                rows: [],
              };
            },
          );

        const result =
          await grantPersonalTrial({
            dbClient: client,
            userId: NEW_USER_ID,
            source:
              'registration',
            phone:
              '+233241234567',
            phoneVerifiedAt:
              new Date(),
            installationId:
              INSTALLATION_ID,
            simIccid: null,
            pepper: PEPPER,
          });

        expect(
          result.granted
        ).toBe(false);

        expect(
          result.reason
        ).toBe(
          TrialDecisionReason
            .TRIAL_ALREADY_USED
        );
      },
    );

    test(
      'an unseen verified phone and installation remain eligible',
      async () => {
        const client =
          makeClient(
            async () => ({
              rows: [],
            }),
          );

        const result =
          await assessPersonalTrialEligibility({
            dbClient: client,
            userId: NEW_USER_ID,
            phone:
              '+233501234567',
            phoneVerifiedAt:
              new Date(),
            installationId:
              INSTALLATION_ID,
            simIccid: null,
            pepper: PEPPER,
          });

        expect(
          result.eligible
        ).toBe(true);

        expect(
          result.reason
        ).toBe(
          TrialDecisionReason.ELIGIBLE
        );

        const statements =
          client.query.mock.calls.map(
            ([sql]) =>
              String(sql),
          );

        expect(
          statements.some(
            (sql) =>
              sql.includes(
                "c.claim_type = 'installation'"
              ),
          )
        ).toBe(true);
      },
    );

    test(
      'account deletion detaches entitlement ownership but preserves durable trial claims',
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              '../..',
              'src/controllers/authController.js',
            ),
            'utf8',
          );

        expect(
          source
        ).toContain(
          'UPDATE personal_trial_entitlements'
        );

        expect(
          source
        ).toContain(
          'SET user_id = NULL'
        );

        expect(
          source
        ).not.toContain(
          'DELETE FROM personal_trial_identity_claims'
        );
      },
    );

    test(
      'installation identity is stored as an HMAC rather than raw device identity',
      () => {
        const claim =
          hashPersonalTrialIdentity({
            claimType:
              'installation',
            value:
              INSTALLATION_ID,
            pepper: PEPPER,
          });

        expect(
          claim.claimType
        ).toBe(
          'installation'
        );

        expect(
          claim.claimHash
        ).toMatch(
          /^[0-9a-f]{64}$/
        );

        expect(
          claim.claimHash
        ).not.toContain(
          INSTALLATION_ID
        );
      },
    );
  },
);
