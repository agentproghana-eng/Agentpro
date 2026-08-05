const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');

const REPORT_REASONS = new Set([
  'spam',
  'fraud',
  'harassment',
  'misinformation',
  'inappropriate',
  'privacy',
  'other',
]);

const POST_TYPES = new Set([
  'general',
  'question',
  'network_issue',
  'fraud_alert',
  'business_tip',
  'announcement',
]);

function validateReport(reason, details) {
  if (!REPORT_REASONS.has(reason)) {
    return 'Invalid report reason';
  }

  if (details != null && String(details).trim().length > 2000) {
    return 'Report details cannot exceed 2000 characters';
  }

  return null;
}

// ── Saved posts ────────────────────────────────────────────────

exports.listSavedPosts = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         p.*,
         u.first_name,
         u.last_name,
         u.role,
         TRUE AS is_saved,
         (
           SELECT json_object_agg(reaction_type, cnt)
           FROM (
             SELECT reaction_type, COUNT(*)::int AS cnt
             FROM agent_post_likes
             WHERE post_id = p.id
             GROUP BY reaction_type
           ) reactions
         ) AS reaction_counts,
         (
           SELECT COUNT(*)::int
           FROM agent_post_comments c
           WHERE c.post_id = p.id
         ) AS comment_count,
         (
           SELECT reaction_type
           FROM agent_post_likes l
           WHERE l.post_id = p.id
             AND l.user_id = $1
         ) AS my_reaction
       FROM agent_saved_posts saved
       INNER JOIN agent_posts p
         ON p.id = saved.post_id
       INNER JOIN users u
         ON u.id = p.author_id
       WHERE saved.user_id = $1
         AND p.status = 'active'
         AND NOT EXISTS (
           SELECT 1
           FROM agent_community_blocks block
           WHERE block.blocker_id = $1
             AND block.blocked_user_id = p.author_id
         )
       ORDER BY saved.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('List saved Agent Community posts error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved posts',
    });
  }
};

exports.savePost = async (req, res) => {
  try {
    const post = await query(
      `SELECT id
       FROM agent_posts
       WHERE id = $1
         AND status = 'active'`,
      [req.params.post_id]
    );

    if (!post.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    await query(
      `INSERT INTO agent_saved_posts (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      [req.user.id, req.params.post_id]
    );

    res.json({
      success: true,
      message: 'Post saved',
    });
  } catch (error) {
    logger.error('Save Agent Community post error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to save post',
    });
  }
};

exports.unsavePost = async (req, res) => {
  try {
    await query(
      `DELETE FROM agent_saved_posts
       WHERE user_id = $1
         AND post_id = $2`,
      [req.user.id, req.params.post_id]
    );

    res.json({
      success: true,
      message: 'Post removed from saved posts',
    });
  } catch (error) {
    logger.error('Unsave Agent Community post error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to remove saved post',
    });
  }
};

// ── Reports ────────────────────────────────────────────────────

exports.reportPost = async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  const details = req.body.details?.toString().trim() || null;
  const validationError = validateReport(reason, details);

  if (validationError) {
    return res.status(422).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const post = await query(
      `SELECT id, author_id
       FROM agent_posts
       WHERE id = $1`,
      [req.params.post_id]
    );

    if (!post.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (post.rows[0].author_id === req.user.id) {
      return res.status(422).json({
        success: false,
        message: 'You cannot report your own post',
      });
    }

    await query(
      `INSERT INTO agent_post_reports (
         post_id,
         reported_by,
         reason,
         details
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, reported_by)
       DO UPDATE SET
         reason = EXCLUDED.reason,
         details = EXCLUDED.details,
         status = 'pending',
         reviewed_by = NULL,
         reviewed_at = NULL,
         resolution_note = NULL,
         updated_at = NOW()`,
      [
        req.params.post_id,
        req.user.id,
        reason,
        details,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Post reported for review',
    });
  } catch (error) {
    logger.error('Report Agent Community post error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to report post',
    });
  }
};

exports.reportComment = async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  const details = req.body.details?.toString().trim() || null;
  const validationError = validateReport(reason, details);

  if (validationError) {
    return res.status(422).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const comment = await query(
      `SELECT id, author_id
       FROM agent_post_comments
       WHERE id = $1`,
      [req.params.comment_id]
    );

    if (!comment.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    if (comment.rows[0].author_id === req.user.id) {
      return res.status(422).json({
        success: false,
        message: 'You cannot report your own comment',
      });
    }

    await query(
      `INSERT INTO agent_comment_reports (
         comment_id,
         reported_by,
         reason,
         details
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (comment_id, reported_by)
       DO UPDATE SET
         reason = EXCLUDED.reason,
         details = EXCLUDED.details,
         status = 'pending',
         reviewed_by = NULL,
         reviewed_at = NULL,
         resolution_note = NULL,
         updated_at = NOW()`,
      [
        req.params.comment_id,
        req.user.id,
        reason,
        details,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Comment reported for review',
    });
  } catch (error) {
    logger.error('Report Agent Community comment error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to report comment',
    });
  }
};

// ── Blocking ───────────────────────────────────────────────────

exports.listBlockedUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.role,
         blocks.created_at AS blocked_at
       FROM agent_community_blocks blocks
       INNER JOIN users u
         ON u.id = blocks.blocked_user_id
       WHERE blocks.blocker_id = $1
       ORDER BY blocks.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('List blocked Agent Community users error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch blocked users',
    });
  }
};

exports.blockUser = async (req, res) => {
  const blockedUserId = req.params.user_id;

  if (blockedUserId === req.user.id) {
    return res.status(422).json({
      success: false,
      message: 'You cannot block yourself',
    });
  }

  try {
    const user = await query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND role IN ('business_owner', 'manager', 'agent')`,
      [blockedUserId]
    );

    if (!user.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Community member not found',
      });
    }

    await query(
      `INSERT INTO agent_community_blocks (
         blocker_id,
         blocked_user_id
       )
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.user.id, blockedUserId]
    );

    res.json({
      success: true,
      message: 'User blocked',
    });
  } catch (error) {
    logger.error('Block Agent Community user error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to block user',
    });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    await query(
      `DELETE FROM agent_community_blocks
       WHERE blocker_id = $1
         AND blocked_user_id = $2`,
      [req.user.id, req.params.user_id]
    );

    res.json({
      success: true,
      message: 'User unblocked',
    });
  } catch (error) {
    logger.error('Unblock Agent Community user error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to unblock user',
    });
  }
};

// ── Accepted answers ───────────────────────────────────────────

exports.acceptAnswer = async (req, res) => {
  const { comment_id } = req.body;

  if (!comment_id) {
    return res.status(422).json({
      success: false,
      message: 'comment_id is required',
    });
  }

  try {
    const postResult = await query(
      `SELECT id, author_id, post_type
       FROM agent_posts
       WHERE id = $1`,
      [req.params.post_id]
    );

    if (!postResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const post = postResult.rows[0];
    const canModerate = req.user.role === 'superuser';

    if (post.author_id !== req.user.id && !canModerate) {
      return res.status(403).json({
        success: false,
        message: 'Only the post author or a moderator can accept an answer',
      });
    }

    if (post.post_type !== 'question') {
      return res.status(422).json({
        success: false,
        message: 'Accepted answers are only available on question posts',
      });
    }

    const commentResult = await query(
      `SELECT id
       FROM agent_post_comments
       WHERE id = $1
         AND post_id = $2`,
      [comment_id, req.params.post_id]
    );

    if (!commentResult.rows.length) {
      return res.status(422).json({
        success: false,
        message: 'Comment does not belong to this post',
      });
    }

    await query(
      `UPDATE agent_posts
       SET accepted_comment_id = $1
       WHERE id = $2`,
      [comment_id, req.params.post_id]
    );

    res.json({
      success: true,
      message: 'Answer accepted',
    });
  } catch (error) {
    logger.error('Accept Agent Community answer error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to accept answer',
    });
  }
};

exports.clearAcceptedAnswer = async (req, res) => {
  try {
    const result = await query(
      `UPDATE agent_posts
       SET accepted_comment_id = NULL
       WHERE id = $1
         AND (
           author_id = $2
           OR $3 = 'superuser'
         )
       RETURNING id`,
      [
        req.params.post_id,
        req.user.id,
        req.user.role,
      ]
    );

    if (!result.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change this accepted answer',
      });
    }

    res.json({
      success: true,
      message: 'Accepted answer cleared',
    });
  } catch (error) {
    logger.error('Clear accepted answer error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to clear accepted answer',
    });
  }
};

// ── Moderator controls ─────────────────────────────────────────

exports.updatePostModeration = async (req, res) => {
  const {
    is_pinned,
    is_official,
    is_urgent,
    post_type,
    status,
    reason,
  } = req.body;

  if (post_type != null && !POST_TYPES.has(post_type)) {
    return res.status(422).json({
      success: false,
      message: 'Invalid post type',
    });
  }

  if (
    status != null &&
    !['active', 'removed', 'pending_review'].includes(status)
  ) {
    return res.status(422).json({
      success: false,
      message: 'Invalid moderation status',
    });
  }

  try {
    const currentResult = await query(
      `SELECT
         id,
         status,
         post_type,
         is_pinned,
         is_official,
         is_urgent
       FROM agent_posts
       WHERE id = $1`,
      [req.params.post_id]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const current = currentResult.rows[0];

    const updated = {
      status: status ?? current.status,
      post_type: post_type ?? current.post_type,
      is_pinned:
        typeof is_pinned === 'boolean'
          ? is_pinned
          : current.is_pinned,
      is_official:
        typeof is_official === 'boolean'
          ? is_official
          : current.is_official,
      is_urgent:
        typeof is_urgent === 'boolean'
          ? is_urgent
          : current.is_urgent,
    };

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE agent_posts
         SET status = $1,
             post_type = $2,
             is_pinned = $3,
             is_official = $4,
             is_urgent = $5,
             moderated_by = $6,
             moderated_at = NOW(),
             moderation_reason = $7
         WHERE id = $8`,
        [
          updated.status,
          updated.post_type,
          updated.is_pinned,
          updated.is_official,
          updated.is_urgent,
          req.user.id,
          reason?.toString().trim() || null,
          req.params.post_id,
        ]
      );

      const actions = [];

      if (current.status !== updated.status) {
        actions.push(
          updated.status === 'removed'
            ? 'remove'
            : updated.status === 'active'
              ? 'restore'
              : 'approve'
        );
      }

      if (current.is_pinned !== updated.is_pinned) {
        actions.push(updated.is_pinned ? 'pin' : 'unpin');
      }

      if (current.is_official !== updated.is_official) {
        actions.push(
          updated.is_official
            ? 'mark_official'
            : 'remove_official'
        );
      }

      if (current.is_urgent !== updated.is_urgent) {
        actions.push(
          updated.is_urgent
            ? 'mark_urgent'
            : 'remove_urgent'
        );
      }

      if (current.post_type !== updated.post_type) {
        actions.push('change_type');
      }

      for (const action of actions) {
        await client.query(
          `INSERT INTO agent_post_moderation_history (
             post_id,
             moderator_id,
             action,
             previous_values,
             new_values,
             reason
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.params.post_id,
            req.user.id,
            action,
            JSON.stringify(current),
            JSON.stringify(updated),
            reason?.toString().trim() || null,
          ]
        );
      }
    });

    res.json({
      success: true,
      data: updated,
      message: 'Post moderation updated',
    });
  } catch (error) {
    logger.error('Update Agent Community moderation error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to update post moderation',
    });
  }
};

exports.listReports = async (req, res) => {
  const status = req.query.status || 'pending';

  try {
    const [postReports, commentReports] = await Promise.all([
      query(
        `SELECT
           report.*,
           post.content AS reported_content,
           author.first_name AS author_first_name,
           author.last_name AS author_last_name,
           reporter.first_name AS reporter_first_name,
           reporter.last_name AS reporter_last_name
         FROM agent_post_reports report
         INNER JOIN agent_posts post
           ON post.id = report.post_id
         INNER JOIN users author
           ON author.id = post.author_id
         INNER JOIN users reporter
           ON reporter.id = report.reported_by
         WHERE report.status = $1
         ORDER BY report.created_at ASC`,
        [status]
      ),
      query(
        `SELECT
           report.*,
           comment.content AS reported_content,
           comment.post_id,
           author.first_name AS author_first_name,
           author.last_name AS author_last_name,
           reporter.first_name AS reporter_first_name,
           reporter.last_name AS reporter_last_name
         FROM agent_comment_reports report
         INNER JOIN agent_post_comments comment
           ON comment.id = report.comment_id
         INNER JOIN users author
           ON author.id = comment.author_id
         INNER JOIN users reporter
           ON reporter.id = report.reported_by
         WHERE report.status = $1
         ORDER BY report.created_at ASC`,
        [status]
      ),
    ]);

    res.json({
      success: true,
      data: {
        post_reports: postReports.rows,
        comment_reports: commentReports.rows,
      },
    });
  } catch (error) {
    logger.error('List Agent Community reports error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch community reports',
    });
  }
};

exports.resolveReport = async (req, res) => {
  const { report_type, status, resolution_note } = req.body;

  if (!['post', 'comment'].includes(report_type)) {
    return res.status(422).json({
      success: false,
      message: 'report_type must be post or comment',
    });
  }

  if (!['reviewed', 'dismissed', 'actioned'].includes(status)) {
    return res.status(422).json({
      success: false,
      message: 'Invalid report status',
    });
  }

  const table =
    report_type === 'post'
      ? 'agent_post_reports'
      : 'agent_comment_reports';

  try {
    const result = await query(
      `UPDATE ${table}
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           resolution_note = $3
       WHERE id = $4
       RETURNING *`,
      [
        status,
        req.user.id,
        resolution_note?.toString().trim() || null,
        req.params.report_id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Report updated',
    });
  } catch (error) {
    logger.error('Resolve Agent Community report error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to update report',
    });
  }
};

// List all Agent Community posts for superuser moderation.
exports.listModerationPosts = async (req, res) => {
  const {
    status,
    post_type,
    pinned,
    official,
    urgent,
    search,
    page = 1,
    limit = 50,
  } = req.query;

  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 50, 1),
    100,
  );
  const offset = (pageNumber - 1) * pageLimit;

  const conditions = [];
  const values = [];

  const addCondition = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (status) {
    addCondition('post.status = ?', status);
  }

  if (post_type) {
    if (!POST_TYPES.has(post_type)) {
      return res.status(422).json({
        success: false,
        message: 'Invalid post type',
      });
    }

    addCondition('post.post_type = ?', post_type);
  }

  if (pinned === 'true' || pinned === 'false') {
    addCondition('post.is_pinned = ?', pinned === 'true');
  }

  if (official === 'true' || official === 'false') {
    addCondition('post.is_official = ?', official === 'true');
  }

  if (urgent === 'true' || urgent === 'false') {
    addCondition('post.is_urgent = ?', urgent === 'true');
  }

  if (search?.trim()) {
    addCondition(
      `(post.content ILIKE '%' || ? || '%'
        OR author.first_name ILIKE '%' || ? || '%'
        OR author.last_name ILIKE '%' || ? || '%'
        OR author.email ILIKE '%' || ? || '%')`,
      search.trim(),
    );

    const searchValue = values.at(-1);
    values.push(searchValue, searchValue, searchValue);

    const firstParameter = values.length - 3;
    conditions[conditions.length - 1] =
      `(post.content ILIKE '%' || $${firstParameter} || '%'
        OR author.first_name ILIKE '%' || $${firstParameter + 1} || '%'
        OR author.last_name ILIKE '%' || $${firstParameter + 2} || '%'
        OR author.email ILIKE '%' || $${firstParameter + 3} || '%')`;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  try {
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM agent_posts post
       INNER JOIN users author ON author.id = post.author_id
       ${whereClause}`,
      values,
    );

    const dataValues = [...values, pageLimit, offset];
    const limitParameter = dataValues.length - 1;
    const offsetParameter = dataValues.length;

    const result = await query(
      `SELECT
         post.*,
         author.first_name,
         author.last_name,
         author.email,
         author.role,
         (
           SELECT COUNT(*)::int
           FROM agent_post_comments comment
           WHERE comment.post_id = post.id
         ) AS comment_count,
         (
           SELECT COUNT(*)::int
           FROM agent_post_reports report
           WHERE report.post_id = post.id
             AND report.status = 'pending'
         ) AS pending_report_count
       FROM agent_posts post
       INNER JOIN users author ON author.id = post.author_id
       ${whereClause}
       ORDER BY
         post.is_pinned DESC,
         post.is_urgent DESC,
         post.created_at DESC
       LIMIT $${limitParameter}
       OFFSET $${offsetParameter}`,
      dataValues,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total: countResult.rows[0].total,
        has_more:
          offset + result.rows.length <
          countResult.rows[0].total,
      },
    });
  } catch (error) {
    logger.error(
      'List Agent Community moderation posts error:',
      error,
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch community posts',
    });
  }
};

// List the moderation audit trail.
exports.listModerationHistory = async (req, res) => {
  const { post_id, action, page = 1, limit = 50 } = req.query;

  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 50, 1),
    100,
  );
  const offset = (pageNumber - 1) * pageLimit;

  const conditions = [];
  const values = [];

  if (post_id) {
    values.push(post_id);
    conditions.push(`history.post_id = $${values.length}`);
  }

  if (action) {
    values.push(action);
    conditions.push(`history.action = $${values.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  try {
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM agent_post_moderation_history history
       ${whereClause}`,
      values,
    );

    const dataValues = [...values, pageLimit, offset];
    const limitParameter = dataValues.length - 1;
    const offsetParameter = dataValues.length;

    const result = await query(
      `SELECT
         history.*,
         post.content AS post_content,
         author.first_name AS author_first_name,
         author.last_name AS author_last_name,
         moderator.first_name AS moderator_first_name,
         moderator.last_name AS moderator_last_name,
         moderator.email AS moderator_email
       FROM agent_post_moderation_history history
       INNER JOIN agent_posts post
         ON post.id = history.post_id
       INNER JOIN users author
         ON author.id = post.author_id
       INNER JOIN users moderator
         ON moderator.id = history.moderator_id
       ${whereClause}
       ORDER BY history.created_at DESC
       LIMIT $${limitParameter}
       OFFSET $${offsetParameter}`,
      dataValues,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total: countResult.rows[0].total,
        has_more:
          offset + result.rows.length <
          countResult.rows[0].total,
      },
    });
  } catch (error) {
    logger.error(
      'List Agent Community moderation history error:',
      error,
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch moderation history',
    });
  }
};
