'use strict';

jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
  }),
);

jest.mock(
  '../../src/config/redis',
  () => ({
    redisClient: {
      ping: jest.fn(),
    },
  }),
);

const {
  query,
} = require(
  '../../src/config/database',
);

const {
  redisClient,
} = require(
  '../../src/config/redis',
);

const {
  ASK_AGENTPRO_TOOLS,
  getDiagnosticToolsForMode,
  executeDiagnosticTool,
} = require(
  '../../src/services/askAgentProDiagnosticService',
);

describe(
  'Ask AgentPro mode-isolated diagnostics',
  () => {
    const user = {
      id:
        '11111111-1111-4111-8111-111111111111',
      role:
        'agent',
      company_id:
        '22222222-2222-4222-8222-222222222222',
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'tool schemas never accept caller-supplied identity or secrets',
      () => {
        const serialized =
          JSON.stringify(
            ASK_AGENTPRO_TOOLS,
          );

        for (const forbidden of [
          '"user_id"',
          '"company_id"',
          '"access_token"',
          '"password"',
          '"pin"',
        ]) {
          expect(
            serialized,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    test(
      'Personal mode never exposes Business Hub tool',
      () => {
        const personalNames =
          getDiagnosticToolsForMode(
            'personal',
          ).map(
            (tool) =>
              tool.name,
          );

        const businessNames =
          getDiagnosticToolsForMode(
            'business',
          ).map(
            (tool) =>
              tool.name,
          );

        expect(
          personalNames,
        ).not.toContain(
          'get_my_business_hub_listings',
        );

        expect(
          businessNames,
        ).toContain(
          'get_my_business_hub_listings',
        );
      },
    );

    test(
      'Personal recent transactions query only Personal table',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_recent_transactions',
          user,
          accountMode:
            'personal',
        });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'FROM personal_transactions',
        );

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'WHERE user_id = $1',
        );

        expect(
          query.mock.calls[0][0],
        ).not.toContain(
          'FROM transactions',
        );
      },
    );

    test(
      'Business recent transactions query only Business table',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_recent_transactions',
          user,
          accountMode:
            'business',
        });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'FROM transactions',
        );

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'WHERE agent_id = $1',
        );

        expect(
          query.mock.calls[0][0],
        ).not.toContain(
          'personal_transactions',
        );
      },
    );

    test(
      'Personal exact transaction lookup never falls through to Business',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        const result =
          await executeDiagnosticTool({
            name:
              'get_my_transaction_status',
            args: {
              reference:
                'AGP-123',
            },
            user,
            accountMode:
              'personal',
          });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'FROM personal_transactions',
        );

        expect(result)
          .toMatchObject({
            ok: true,
            found: false,
          });
      },
    );

    test(
      'Business exact transaction lookup never queries Personal',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_transaction_status',
          args: {
            reference:
              'AGP-123',
          },
          user,
          accountMode:
            'business',
        });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'FROM transactions',
        );

        expect(
          query.mock.calls[0][0],
        ).not.toContain(
          'personal_transactions',
        );
      },
    );

    test(
      'Personal subscription never queries Business subscription',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_subscription_status',
          user,
          accountMode:
            'personal',
        });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'FROM personal_subscriptions',
        );

        expect(
          query.mock.calls[0][0],
        ).not.toContain(
          'FROM subscriptions',
        );
      },
    );

    test(
      'Business subscription uses authenticated company only',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_subscription_status',
          user,
          accountMode:
            'business',
        });

        expect(query)
          .toHaveBeenCalledTimes(1);

        expect(
          query.mock.calls[0][0],
        ).toContain(
          'WHERE company_id = $1',
        );

        expect(
          query.mock.calls[0][1],
        ).toEqual([
          user.company_id,
        ]);
      },
    );

    test(
      'Personal account context does not return Business company context',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            {
              role:
                'agent',
              status:
                'active',
              has_personal_capability:
                true,
            },
          ],
        });

        const result =
          await executeDiagnosticTool({
            name:
              'get_my_account_context',
            user,
            accountMode:
              'personal',
          });

        expect(result)
          .toMatchObject({
            ok: true,
            account: {
              mode:
                'personal',
            },
          });

        expect(
          result.account,
        ).not.toHaveProperty(
          'company_name',
        );
      },
    );

    test(
      'Business Hub is blocked from Personal mode without querying database',
      async () => {
        const result =
          await executeDiagnosticTool({
            name:
              'get_my_business_hub_listings',
            user,
            accountMode:
              'personal',
          });

        expect(result)
          .toMatchObject({
            ok: false,
          });

        expect(query)
          .not.toHaveBeenCalled();
      },
    );

    test(
      'Business Hub uses signed-in user ownership',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        await executeDiagnosticTool({
          name:
            'get_my_business_hub_listings',
          user,
          accountMode:
            'business',
        });

        expect(query)
          .toHaveBeenCalledWith(
            expect.stringContaining(
              'WHERE posted_by = $1',
            ),
            [user.id],
          );
      },
    );

    test(
      'service health contains no infrastructure credentials',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            {
              '?column?': 1,
            },
          ],
        });

        redisClient.ping
          .mockResolvedValueOnce(
            'PONG',
          );

        const result =
          await executeDiagnosticTool({
            name:
              'get_agentpro_service_status',
            user,
            accountMode:
              'personal',
          });

        expect(result)
          .toMatchObject({
            ok: true,
            api:
              'healthy',
            database:
              'healthy',
            redis:
              'healthy',
          });

        expect(
          JSON.stringify(result),
        ).not.toMatch(
          /password|secret|token|key/i,
        );
      },
    );

    test(
      'unknown tools fail closed',
      async () => {
        const result =
          await executeDiagnosticTool({
            name:
              'run_shell',
            user,
            accountMode:
              'business',
          });

        expect(result)
          .toEqual({
            ok: false,
            error:
              'Unsupported diagnostic tool.',
          });

        expect(query)
          .not.toHaveBeenCalled();
      },
    );

    test(
      'missing account mode fails closed',
      async () => {
        await expect(
          executeDiagnosticTool({
            name:
              'get_my_recent_transactions',
            user,
          }),
        ).rejects.toThrow(
          'Valid account mode is required',
        );

        expect(query)
          .not.toHaveBeenCalled();
      },
    );
  },
);
