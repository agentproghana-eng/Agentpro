'use strict';

jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
    withTransaction:
      jest.fn(),
  }),
);

const {
  query,
  withTransaction,
} = require(
  '../../src/config/database',
);

const {
  DEFAULT_PERSONAL_BUDGET_GHS,
  DEFAULT_BUSINESS_BUDGET_GHS,
  budgetLimitGhs,
  periodStartUtc,
  resolveUsageScope,
  startFullRequest,
} = require(
  '../../src/services/askAgentProBudgetService',
);

describe(
  'Ask AgentPro monthly budget',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      delete process.env
        .ASK_AGENTPRO_PERSONAL_BUDGET_GHS;

      delete process.env
        .ASK_AGENTPRO_BUSINESS_BUDGET_GHS;
    });

    test(
      'defaults to GHS 0.50 Personal and GHS 1.00 Business',
      () => {
        expect(
          DEFAULT_PERSONAL_BUDGET_GHS,
        ).toBe(0.50);

        expect(
          DEFAULT_BUSINESS_BUDGET_GHS,
        ).toBe(1.00);

        expect(
          budgetLimitGhs(
            'personal',
          ),
        ).toBe(0.50);

        expect(
          budgetLimitGhs(
            'business',
          ),
        ).toBe(1.00);
      },
    );

    test(
      'uses calendar month in UTC',
      () => {
        expect(
          periodStartUtc(
            new Date(
              '2026-09-30T23:59:59Z',
            ),
          ),
        ).toBe(
          '2026-09-01',
        );
      },
    );

    test(
      'Personal allowance is scoped to the signed-in user',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            { '?column?': 1 },
          ],
        });

        const user = {
          id:
            '11111111-1111-4111-8111-111111111111',
          company_id:
            '22222222-2222-4222-8222-222222222222',
        };

        const scope =
          await resolveUsageScope(
            user,
            'personal',
          );

        expect(
          scope,
        ).toMatchObject({
          ok: true,
          scopeType:
            'personal',
          scopeId:
            user.id,
          budgetGhs:
            0.50,
        });

        expect(
          query,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            'WHERE user_id = $1',
          ),
          [user.id],
        );
      },
    );

    test(
      'Business allowance is shared by company',
      async () => {
        const user = {
          id:
            '11111111-1111-4111-8111-111111111111',
          company_id:
            '22222222-2222-4222-8222-222222222222',
        };

        const scope =
          await resolveUsageScope(
            user,
            'business',
          );

        expect(
          scope,
        ).toMatchObject({
          ok: true,
          scopeType:
            'business',
          scopeId:
            user.company_id,
          budgetGhs:
            1.00,
        });
      },
    );

    test(
      'Full request fails closed after allowance is exhausted',
      async () => {
        const client = {
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [],
            })
            .mockResolvedValueOnce({
              rows: [
                {
                  spent_ghs:
                    '0.500000',
                  reserved_ghs:
                    '0',
                  full_requests: 4,
                  basic_requests: 3,
                  active_full_token:
                    null,
                  active_full_expires_at:
                    null,
                },
              ],
            }),
        };

        withTransaction
          .mockImplementation(
            async (callback) =>
              callback(client),
          );

        const result =
          await startFullRequest({
            scopeType:
              'personal',
            scopeId:
              '11111111-1111-4111-8111-111111111111',
            budgetGhs: 0.50,
            periodStart:
              '2026-09-01',
          });

        expect(
          result.allowed,
        ).toBe(false);

        expect(
          result.reason,
        ).toBe(
          'budget_exhausted',
        );

        expect(
          client.query
            .mock.calls[1][0],
        ).toContain(
          'FOR UPDATE',
        );
      },
    );
  },
);
