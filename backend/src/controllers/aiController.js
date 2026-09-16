const {
  query,
  withTransaction,
} = require('../config/database');

const {
  logger,
} = require('../utils/logger');

const {
  answerAskAgentPro,
  redactSensitiveText,
} = require(
  '../services/askAgentProService',
);

const MAX_HISTORY_MESSAGES = 12;


const AI_HISTORY_CURSOR_VERSION = 1;

const AI_HISTORY_CURSOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAiHistoryCursorDate(
  value,
) {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  const normalized =
    parsed.toISOString();

  return normalized === value
    ? normalized
    : null;
}

function encodeAiHistoryCursor({
  kind,
  value,
  id,
  conversationId = null,
}) {
  const normalizedValue =
    value instanceof Date
      ? value.toISOString()
      : new Date(
          value,
        ).toISOString();

  const payload = {
    v:
      AI_HISTORY_CURSOR_VERSION,
    kind,
    value:
      normalizedValue,
    id,
  };

  if (conversationId) {
    payload.conversation_id =
      conversationId;
  }

  return Buffer.from(
    JSON.stringify(payload),
    'utf8',
  ).toString(
    'base64url',
  );
}

function decodeAiHistoryCursor(
  cursor,
  {
    kind,
    conversationId = null,
  },
) {
  if (!cursor) {
    return null;
  }

  try {
    const decoded =
      JSON.parse(
        Buffer.from(
          String(cursor),
          'base64url',
        ).toString(
          'utf8',
        ),
      );

    if (
      !decoded ||
      decoded.v !==
        AI_HISTORY_CURSOR_VERSION ||
      decoded.kind !== kind ||
      !AI_HISTORY_CURSOR_UUID.test(
        String(
          decoded.id || '',
        ),
      )
    ) {
      return false;
    }

    const value =
      normalizeAiHistoryCursorDate(
        decoded.value,
      );

    if (!value) {
      return false;
    }

    if (
      conversationId !== null &&
      decoded.conversation_id !==
        conversationId
    ) {
      return false;
    }

    return {
      value,
      id:
        decoded.id,
    };
  } catch (_) {
    return false;
  }
}

function invalidAiHistoryCursor(
  res,
) {
  return res
    .status(422)
    .json({
      success: false,
      code:
        'INVALID_CURSOR',
      message:
        'The pagination cursor is invalid or expired.',
    });
}


exports.chat = async (req, res) => {
  const {
    message,
    conversation_id,
    mode,
  } = req.body;

  const userId =
    req.user.id;

  try {
    const sanitizedMessage =
      redactSensitiveText(
        message,
      );

    let conversationId =
      conversation_id;

    let history = [];

    if (conversationId) {
      const convResult =
        await query(
          `SELECT
             id,
             context ->> 'mode'
               AS conversation_mode
           FROM ai_conversations
           WHERE id = $1
             AND user_id = $2`,
          [
            conversationId,
            userId,
          ],
        );

      if (
        convResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            'Conversation not found',
        });
      }

      const storedMode =
        convResult.rows[0]
          .conversation_mode;

      if (storedMode !== mode) {
        return res.status(409).json({
          success: false,
          message:
            'Please start a new Ask AgentPro conversation for this account mode.',
          code:
            'ASK_AGENTPRO_MODE_CHANGED',
        });
      }

      const messagesResult =
        await query(
          `SELECT role, content
           FROM (
             SELECT
               role,
               content,
               created_at
             FROM ai_messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT $2
           ) recent
           ORDER BY created_at ASC`,
          [
            conversationId,
            MAX_HISTORY_MESSAGES,
          ],
        );

      history =
        messagesResult.rows;
    } else {
      const convResult =
        await query(
          `INSERT INTO ai_conversations (
             user_id,
             context
           )
           VALUES ($1, $2)
           RETURNING id`,
          [
            userId,
            JSON.stringify({
              role:
                req.user.role,
              company_id:
                req.user.company_id,
              assistant:
                'ask_agentpro_v1',
              mode,
            }),
          ],
        );

      conversationId =
        convResult.rows[0].id;
    }

    const result =
      await answerAskAgentPro({
        req,
        conversationId,
        history,
        message:
          sanitizedMessage,
        accountMode:
          mode,
      });

    await withTransaction(
      async (client) => {
        await client.query(
          `INSERT INTO ai_messages (
             conversation_id,
             role,
             content,
             ai_mode
           )
           VALUES ($1, $2, $3, $4)`,
          [
            conversationId,
            'user',
            sanitizedMessage,
            result.mode,
          ],
        );

        await client.query(
          `INSERT INTO ai_messages (
             conversation_id,
             role,
             content,
             tokens_used,
             ai_mode,
             ai_provider,
             input_tokens,
             output_tokens,
             cached_input_tokens,
             cost_ghs
           )
           VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10
           )`,
          [
            conversationId,
            'assistant',
            result.message,
            result.usage.totalTokens,
            result.mode,
            result.provider,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.cachedInputTokens,
            result.costGhs,
          ],
        );

        await client.query(
          `UPDATE ai_conversations
           SET updated_at = NOW()
           WHERE id = $1`,
          [conversationId],
        );
      },
    );

    return res.json({
      success: true,
      data: {
        conversation_id:
          conversationId,
        message:
          result.message,
        mode:
          result.mode,
        diagnostics_available:
          result
            .diagnosticsAvailable,
        allowance:
          result.allowance,
      },
    });
  } catch (error) {
    logger.error(
      'Ask AgentPro chat error',
      {
        status:
          error?.status || null,
        code:
          error?.code || null,
        message:
          error?.message ||
          'unknown',
      },
    );

    if (
      error?.status === 403
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Ask AgentPro is not available for this account mode.',
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Ask AgentPro could not complete that request. Please try again.',
    });
  }
};


exports.listConversationsCursor =
  async (req, res) => {
    const {
      limit = 20,
      cursor,
    } = req.query;

    const parsedLimit =
      Math.min(
        50,
        Math.max(
          1,
          parseInt(
            limit,
            10,
          ) || 20,
        ),
      );

    const decodedCursor =
      decodeAiHistoryCursor(
        cursor,
        {
          kind:
            'conversations',
        },
      );

    if (
      cursor &&
      decodedCursor === false
    ) {
      return invalidAiHistoryCursor(
        res,
      );
    }

    try {
      const params = [
        req.user.id,
      ];

      let seekClause = '';

      if (decodedCursor) {
        params.push(
          decodedCursor.value,
          decodedCursor.id,
        );

        seekClause =
          ` AND (
              c.updated_at < $2::timestamptz
              OR (
                c.updated_at = $2::timestamptz
                AND c.id < $3::uuid
              )
            )`;
      }

      params.push(
        parsedLimit + 1,
      );

      const limitParam =
        `$${params.length}`;

      const result =
        await query(
          `SELECT
             c.id,
             c.title,
             c.created_at,
             c.updated_at,
             (
               SELECT
                 content
               FROM ai_messages
               WHERE
                 conversation_id = c.id
               ORDER BY
                 created_at DESC,
                 id DESC
               LIMIT 1
             ) AS last_message
           FROM ai_conversations c
           WHERE
             c.user_id = $1
             ${seekClause}
           ORDER BY
             c.updated_at DESC,
             c.id DESC
           LIMIT ${limitParam}`,
          params,
        );

      const hasMore =
        result.rows.length >
        parsedLimit;

      const rows =
        result.rows.slice(
          0,
          parsedLimit,
        );

      let nextCursor = null;

      if (
        hasMore &&
        rows.length > 0
      ) {
        const last =
          rows[
            rows.length - 1
          ];

        nextCursor =
          encodeAiHistoryCursor({
            kind:
              'conversations',
            value:
              last.updated_at,
            id:
              last.id,
          });
      }

      return res.json({
        success: true,
        data:
          rows,
        meta: {
          limit:
            parsedLimit,
          has_more:
            hasMore,
          next_cursor:
            nextCursor,
        },
      });
    } catch (error) {
      logger.error(
        'List Ask AgentPro conversations cursor error:',
        error,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            'Failed to fetch conversations',
        });
    }
  };

exports.listConversationMessagesCursor =
  async (req, res) => {
    const {
      conversation_id,
    } = req.params;

    const {
      limit = 50,
      cursor,
    } = req.query;

    const parsedLimit =
      Math.min(
        100,
        Math.max(
          1,
          parseInt(
            limit,
            10,
          ) || 50,
        ),
      );

    const decodedCursor =
      decodeAiHistoryCursor(
        cursor,
        {
          kind:
            'messages',
          conversationId:
            conversation_id,
        },
      );

    if (
      cursor &&
      decodedCursor === false
    ) {
      return invalidAiHistoryCursor(
        res,
      );
    }

    try {
      const convResult =
        await query(
          `SELECT *
           FROM ai_conversations
           WHERE id = $1
             AND user_id = $2`,
          [
            conversation_id,
            req.user.id,
          ],
        );

      if (
        convResult.rows.length ===
        0
      ) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              'Conversation not found',
          });
      }

      const params = [
        conversation_id,
      ];

      let seekClause = '';

      if (decodedCursor) {
        params.push(
          decodedCursor.value,
          decodedCursor.id,
        );

        seekClause =
          ` AND (
              created_at < $2::timestamptz
              OR (
                created_at = $2::timestamptz
                AND id < $3::uuid
              )
            )`;
      }

      params.push(
        parsedLimit + 1,
      );

      const limitParam =
        `$${params.length}`;

      const messagesResult =
        await query(
          `SELECT
             id,
             role,
             content,
             tokens_used,
             ai_mode,
             created_at
           FROM ai_messages
           WHERE
             conversation_id = $1
             ${seekClause}
           ORDER BY
             created_at DESC,
             id DESC
           LIMIT ${limitParam}`,
          params,
        );

      const hasMore =
        messagesResult.rows.length >
        parsedLimit;

      const messages =
        messagesResult.rows.slice(
          0,
          parsedLimit,
        );

      let nextCursor = null;

      if (
        hasMore &&
        messages.length > 0
      ) {
        const last =
          messages[
            messages.length - 1
          ];

        nextCursor =
          encodeAiHistoryCursor({
            kind:
              'messages',
            conversationId:
              conversation_id,
            value:
              last.created_at,
            id:
              last.id,
          });
      }

      return res.json({
        success: true,
        data: {
          conversation:
            convResult.rows[0],
          messages,
        },
        meta: {
          limit:
            parsedLimit,
          has_more:
            hasMore,
          next_cursor:
            nextCursor,
        },
      });
    } catch (error) {
      logger.error(
        'List Ask AgentPro messages cursor error:',
        error,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            'Failed to fetch conversation',
        });
    }
  };

exports.getConversation =
  async (req, res) => {
    const {
      conversation_id,
    } = req.params;

    try {
      const convResult =
        await query(
          `SELECT *
           FROM ai_conversations
           WHERE id = $1
             AND user_id = $2`,
          [
            conversation_id,
            req.user.id,
          ],
        );

      if (
        convResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            'Conversation not found',
        });
      }

      const messagesResult =
        await query(
          `SELECT
             id,
             role,
             content,
             tokens_used,
             ai_mode,
             created_at
           FROM ai_messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC`,
          [conversation_id],
        );

      return res.json({
        success: true,
        data: {
          conversation:
            convResult.rows[0],
          messages:
            messagesResult.rows,
        },
      });
    } catch (error) {
      logger.error(
        'Get Ask AgentPro conversation error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to fetch conversation',
      });
    }
  };

exports.listConversations =
  async (req, res) => {
    const {
      page = 1,
      limit = 20,
    } = req.query;

    const parsedPage =
      Math.max(
        1,
        parseInt(page, 10) || 1,
      );

    const parsedLimit =
      Math.min(
        50,
        Math.max(
          1,
          parseInt(limit, 10) ||
          20,
        ),
      );

    const offset =
      (
        parsedPage - 1
      ) * parsedLimit;

    try {
      const result =
        await query(
          `SELECT
             c.id,
             c.title,
             c.created_at,
             c.updated_at,
             (
               SELECT content
               FROM ai_messages
               WHERE conversation_id = c.id
               ORDER BY created_at DESC
               LIMIT 1
             ) AS last_message
           FROM ai_conversations c
           WHERE c.user_id = $1
           ORDER BY c.updated_at DESC
           LIMIT $2
           OFFSET $3`,
          [
            req.user.id,
            parsedLimit,
            offset,
          ],
        );

      return res.json({
        success: true,
        data:
          result.rows,
      });
    } catch (error) {
      logger.error(
        'List Ask AgentPro conversations error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to fetch conversations',
      });
    }
  };
