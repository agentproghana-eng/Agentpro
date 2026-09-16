'use strict';

const fs =
  require('fs');
const path =
  require('path');

const mockQuery =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),
    withTransaction:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error:
        jest.fn(),
      warn:
        jest.fn(),
      info:
        jest.fn(),
    },
  }),
);

jest.mock(
  '../../src/services/askAgentProService',
  () => ({
    answerAskAgentPro:
      jest.fn(),
    redactSensitiveText:
      jest.fn(
        (value) => value,
      ),
  }),
);

const controller =
  require(
    '../../src/controllers/aiController',
  );

const controllerSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/aiController.js',
    ),
    'utf8',
  );

const routes =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../src/routes/ai.routes.js',
    ),
    'utf8',
  );

const migration =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/136_ask_agentpro_history_cursor_indexes.sql',
    ),
    'utf8',
  );

const USER_ID =
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CONVERSATION_ID =
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ID_1 =
  '11111111-1111-1111-1111-111111111111';
const ID_2 =
  '22222222-2222-2222-2222-222222222222';
const ID_3 =
  '33333333-3333-3333-3333-333333333333';

function makeRes() {
  return {
    status:
      jest.fn()
        .mockReturnThis(),
    json:
      jest.fn()
        .mockReturnThis(),
  };
}

function decodeCursor(
  cursor,
) {
  return JSON.parse(
    Buffer.from(
      cursor,
      'base64url',
    ).toString(
      'utf8',
    ),
  );
}

function encodeCursor(
  payload,
) {
  return Buffer.from(
    JSON.stringify(
      payload,
    ),
    'utf8',
  ).toString(
    'base64url',
  );
}

describe(
  'Ask AgentPro history cursor pagination',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'registers additive cursor routes before legacy conversation id route',
      () => {
        const normalized =
          routes.replace(
            /\s+/g,
            ' ',
          );

        expect(
          normalized,
        ).toContain(
          "router.get( '/conversations/cursor', aiController.listConversationsCursor, );",
        );

        expect(
          normalized,
        ).toContain(
          "router.get( '/conversations/:conversation_id/messages/cursor', [ param('conversation_id') .isUUID() .withMessage( 'Invalid conversation ID', ), ], handleValidation, aiController.listConversationMessagesCursor, );",
        );

        expect(
          normalized.indexOf(
            "'/conversations/cursor'",
          ),
        ).toBeLessThan(
          normalized.indexOf(
            "'/conversations/:conversation_id'",
          ),
        );
      },
    );

    test(
      'new cursor handlers are bounded without OFFSET or COUNT',
      () => {
        const conversationStart =
          controllerSource.indexOf(
            'exports.listConversationsCursor',
          );

        const messageStart =
          controllerSource.indexOf(
            'exports.listConversationMessagesCursor',
          );

        const legacyStart =
          controllerSource.indexOf(
            'exports.getConversation',
            messageStart,
          );

        const conversationSource =
          controllerSource.slice(
            conversationStart,
            messageStart,
          );

        const messageSource =
          controllerSource.slice(
            messageStart,
            legacyStart,
          );

        for (
          const source
          of [
            conversationSource,
            messageSource,
          ]
        ) {
          expect(source)
            .toContain(
              'parsedLimit + 1',
            );

          expect(source)
            .not.toContain(
              'OFFSET',
            );

          expect(source)
            .not.toContain(
              'COUNT(*)',
            );
        }
      },
    );

    test(
      'migration 136 has compound conversation and message cursor indexes',
      () => {
        expect(migration)
          .toContain(
            'idx_ai_conversations_user_updated_cursor',
          );

        expect(migration)
          .toContain(
            'user_id',
          );

        expect(migration)
          .toContain(
            'updated_at DESC',
          );

        expect(migration)
          .toContain(
            'idx_ai_messages_conversation_created_cursor',
          );

        expect(migration)
          .toContain(
            'conversation_id',
          );

        expect(migration)
          .toContain(
            'created_at DESC',
          );

        expect(migration)
          .toContain(
            'id DESC',
          );
      },
    );

    test(
      'conversation first page uses limit plus one and emits v1 cursor',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  ID_3,
                updated_at:
                  new Date(
                    '2026-09-16T12:03:00.000Z',
                  ),
              },
              {
                id:
                  ID_2,
                updated_at:
                  new Date(
                    '2026-09-16T12:02:00.000Z',
                  ),
              },
              {
                id:
                  ID_1,
                updated_at:
                  new Date(
                    '2026-09-16T12:01:00.000Z',
                  ),
              },
            ],
          });

        const req = {
          user: {
            id:
              USER_ID,
          },
          query: {
            limit:
              '2',
          },
        };

        const res =
          makeRes();

        await controller
          .listConversationsCursor(
            req,
            res,
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            1,
          );

        const [
          sql,
          params,
        ] =
          mockQuery
            .mock
            .calls[0];

        expect(sql)
          .toContain(
            'c.updated_at DESC',
          );

        expect(sql)
          .toContain(
            'c.id DESC',
          );

        expect(params)
          .toEqual([
            USER_ID,
            3,
          ]);

        const response =
          res.json
            .mock
            .calls[0][0];

        expect(
          response.data,
        ).toHaveLength(
          2,
        );

        expect(
          response.meta,
        ).toMatchObject({
          limit:
            2,
          has_more:
            true,
        });

        const cursor =
          decodeCursor(
            response
              .meta
              .next_cursor,
          );

        expect(cursor)
          .toEqual({
            v:
              1,
            kind:
              'conversations',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
          });
      },
    );

    test(
      'conversation seek preserves stable updated_at and id boundary',
      async () => {
        const cursor =
          encodeCursor({
            v:
              1,
            kind:
              'conversations',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          });

        await controller
          .listConversationsCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              query: {
                cursor,
                limit:
                  '2',
              },
            },
            makeRes(),
          );

        const [
          sql,
          params,
        ] =
          mockQuery
            .mock
            .calls[0];

        expect(sql)
          .toContain(
            'c.updated_at < $2::timestamptz',
          );

        expect(sql)
          .toContain(
            'c.id < $3::uuid',
          );

        expect(params)
          .toEqual([
            USER_ID,
            '2026-09-16T12:02:00.000Z',
            ID_2,
            3,
          ]);
      },
    );

    test(
      'malformed conversation cursor returns 422 without database work',
      async () => {
        const res =
          makeRes();

        await controller
          .listConversationsCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              query: {
                cursor:
                  'definitely-invalid',
              },
            },
            res,
          );

        expect(mockQuery)
          .not
          .toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(
            422,
          );

        expect(res.json)
          .toHaveBeenCalledWith({
            success:
              false,
            code:
              'INVALID_CURSOR',
            message:
              'The pagination cursor is invalid or expired.',
          });
      },
    );

    test(
      'wrong cursor version returns 422 without database work',
      async () => {
        const cursor =
          encodeCursor({
            v:
              2,
            kind:
              'conversations',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
          });

        const res =
          makeRes();

        await controller
          .listConversationsCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              query: {
                cursor,
              },
            },
            res,
          );

        expect(mockQuery)
          .not
          .toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(
            422,
          );

        expect(res.json)
          .toHaveBeenCalledWith({
            success:
              false,
            code:
              'INVALID_CURSOR',
            message:
              'The pagination cursor is invalid or expired.',
          });
      },
    );

    test(
      'cursor kind mismatch returns 422 without database work',
      async () => {
        const cursor =
          encodeCursor({
            v:
              1,
            kind:
              'messages',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
            conversation_id:
              CONVERSATION_ID,
          });

        const res =
          makeRes();

        await controller
          .listConversationsCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              query: {
                cursor,
              },
            },
            res,
          );

        expect(mockQuery)
          .not
          .toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(
            422,
          );
      },
    );

    test(
      'message first page enforces ownership then returns bounded newest-first page',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  CONVERSATION_ID,
                user_id:
                  USER_ID,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  ID_3,
                created_at:
                  new Date(
                    '2026-09-16T12:03:00.000Z',
                  ),
              },
              {
                id:
                  ID_2,
                created_at:
                  new Date(
                    '2026-09-16T12:02:00.000Z',
                  ),
              },
              {
                id:
                  ID_1,
                created_at:
                  new Date(
                    '2026-09-16T12:01:00.000Z',
                  ),
              },
            ],
          });

        const res =
          makeRes();

        await controller
          .listConversationMessagesCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              params: {
                conversation_id:
                  CONVERSATION_ID,
              },
              query: {
                limit:
                  '2',
              },
            },
            res,
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            2,
          );

        expect(
          mockQuery
            .mock
            .calls[0][1],
        ).toEqual([
          CONVERSATION_ID,
          USER_ID,
        ]);

        const [
          messageSql,
          messageParams,
        ] =
          mockQuery
            .mock
            .calls[1];

        expect(messageSql)
          .toContain(
            'created_at DESC',
          );

        expect(messageSql)
          .toContain(
            'id DESC',
          );

        expect(messageParams)
          .toEqual([
            CONVERSATION_ID,
            3,
          ]);

        const response =
          res.json
            .mock
            .calls[0][0];

        expect(
          response
            .data
            .messages,
        ).toHaveLength(
          2,
        );

        expect(
          response
            .meta
            .has_more,
        ).toBe(
          true,
        );

        const cursor =
          decodeCursor(
            response
              .meta
              .next_cursor,
          );

        expect(cursor)
          .toEqual({
            v:
              1,
            kind:
              'messages',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
            conversation_id:
              CONVERSATION_ID,
          });
      },
    );

    test(
      'message cursor is bound to its conversation and fails before DB access',
      async () => {
        const cursor =
          encodeCursor({
            v:
              1,
            kind:
              'messages',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
            conversation_id:
              'cccccccc-cccc-cccc-cccc-cccccccccccc',
          });

        const res =
          makeRes();

        await controller
          .listConversationMessagesCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              params: {
                conversation_id:
                  CONVERSATION_ID,
              },
              query: {
                cursor,
              },
            },
            res,
          );

        expect(mockQuery)
          .not
          .toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(
            422,
          );
      },
    );

    test(
      'message seek uses created_at and id cursor boundary',
      async () => {
        const cursor =
          encodeCursor({
            v:
              1,
            kind:
              'messages',
            value:
              '2026-09-16T12:02:00.000Z',
            id:
              ID_2,
            conversation_id:
              CONVERSATION_ID,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  CONVERSATION_ID,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        await controller
          .listConversationMessagesCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              params: {
                conversation_id:
                  CONVERSATION_ID,
              },
              query: {
                cursor,
                limit:
                  '2',
              },
            },
            makeRes(),
          );

        const [
          sql,
          params,
        ] =
          mockQuery
            .mock
            .calls[1];

        expect(sql)
          .toContain(
            'created_at < $2::timestamptz',
          );

        expect(sql)
          .toContain(
            'id < $3::uuid',
          );

        expect(params)
          .toEqual([
            CONVERSATION_ID,
            '2026-09-16T12:02:00.000Z',
            ID_2,
            3,
          ]);
      },
    );

    test(
      'message endpoint does not reveal a conversation owned by another user',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          });

        const res =
          makeRes();

        await controller
          .listConversationMessagesCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              params: {
                conversation_id:
                  CONVERSATION_ID,
              },
              query: {},
            },
            res,
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(
            1,
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            404,
          );
      },
    );

    test(
      'noncanonical cursor date is rejected without database work',
      async () => {
        const cursor =
          encodeCursor({
            v:
              1,
            kind:
              'conversations',
            value:
              '2026-09-16T12:02:00Z',
            id:
              ID_2,
          });

        const res =
          makeRes();

        await controller
          .listConversationsCursor(
            {
              user: {
                id:
                  USER_ID,
              },
              query: {
                cursor,
              },
            },
            res,
          );

        expect(mockQuery)
          .not
          .toHaveBeenCalled();

        expect(res.status)
          .toHaveBeenCalledWith(
            422,
          );
      },
    );
  },
);
