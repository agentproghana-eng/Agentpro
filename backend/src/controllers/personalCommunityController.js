const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { detectAdvertisement } = require('./agentPostController');
const { uploadAudio } = require('../config/cloudinary');

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// Fully separate from the Agent Community per spec - own tables
// (personal_posts, personal_post_likes, personal_post_comments,
// personal_post_comment_reactions), never shared. Structurally mirrors
// the Agent side (same reaction system, same any-depth comment
// threading, same AI ad-detection on creation), but gated differently:
// viewing the feed/comments and reacting to posts/comments is available
// on the Free Personal plan; creating a post or adding a comment/reply
// requires the Paid plan (requirePaidPersonalPlan, applied per-route).

const VALID_REACTIONS = ["like", "love", "laugh", "wow", "sad", "pray", "dislike"];

// ─── Create Post (Paid Personal subscribers only) ──────────────

exports.createPost = async (req, res) => {
  const { content } = req.body;
  const trimmed = (content || "").trim();
  const audioFile = req.file;

  if (!trimmed && !audioFile) {
    return res.status(422).json({ success: false, message: "Post content or a voice note is required" });
  }

  try {
    let audioUrl = null;
    if (audioFile) {
      const filename = `personal_${req.user.id}_${Date.now()}`;
      audioUrl = await uploadAudio(audioFile.buffer, filename);
    }

    let isAd = false;
    if (trimmed) {
      isAd = await detectAdvertisement(trimmed);
    }
    const status = isAd ? "pending_review" : "active";

    const result = await query(
      "INSERT INTO personal_posts (author_id, content, audio_url, status, flagged_reason) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, trimmed || null, audioUrl, status, isAd ? "AI flagged as advertisement" : null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: isAd ? "Your post is under review and will appear once approved." : "Posted",
    });
  } catch (error) {
    logger.error("Create personal post error:", error);
    res.status(500).json({ success: false, message: "Failed to create post" });
  }
};

// ─── List Feed (any Personal user - Free or Paid) ────────────────
// Same visibility rule as the Agent side: active posts from everyone,
// plus the requesting user's own pending_review posts.

exports.listFeed = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const result = await query(
      `SELECT p.*, u.first_name, u.last_name,
              (SELECT json_object_agg(reaction_type, cnt) FROM (
                SELECT reaction_type, COUNT(*) as cnt FROM personal_post_likes
                WHERE post_id = p.id GROUP BY reaction_type
              ) sub) as reaction_counts,
              (SELECT COUNT(*) FROM personal_post_comments c WHERE c.post_id = p.id) as comment_count,
              (SELECT reaction_type FROM personal_post_likes l WHERE l.post_id = p.id AND l.user_id = $1) as my_reaction
       FROM personal_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.status = $2 OR (p.status = $3 AND p.author_id = $1)
       ORDER BY p.created_at DESC
       LIMIT $4 OFFSET $5`,
      [req.user.id, "active", "pending_review", parseInt(limit), offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List personal feed error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch feed" });
  }
};



async function isPersonalPostVisibleToUser(postId, userId) {
  const result = await query(
    `SELECT p.id
     FROM personal_posts p
     WHERE p.id = $1
       AND (
         p.status = 'active'
         OR (
           p.status = 'pending_review'
           AND p.author_id = $2
         )
       )
     LIMIT 1`,
    [postId, userId]
  );

  return result.rows.length > 0;
}

exports.getPost = async (req, res) => {
  const { post_id } = req.params;

  if (!UUID_PATTERN.test(post_id || "")) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  try {
    const result = await query(
      `SELECT
         p.*,
         u.first_name,
         u.last_name,

         (
           SELECT json_object_agg(reaction_type, cnt)
           FROM (
             SELECT
               reaction_type,
               COUNT(*)::int AS cnt
             FROM personal_post_likes
             WHERE post_id = p.id
             GROUP BY reaction_type
           ) reaction_summary
         ) AS reaction_counts,

         (
           SELECT COUNT(*)::int
           FROM personal_post_comments comment
           WHERE comment.post_id = p.id
         ) AS comment_count,

         (
           SELECT reaction_type
           FROM personal_post_likes reaction
           WHERE reaction.post_id = p.id
             AND reaction.user_id = $1
         ) AS my_reaction

       FROM personal_posts p
       INNER JOIN users u
         ON u.id = p.author_id

       WHERE p.id = $2
       AND (
         p.status = 'active'
         OR (
           p.status = 'pending_review'
           AND p.author_id = $1
         )
       )

       LIMIT 1`,
      [req.user.id, post_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error("Get personal post error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch post",
    });
  }
};

// ─── Toggle Reaction on a Post (any Personal user - Free or Paid) ──

exports.toggleLike = async (req, res) => {
  const { post_id } = req.params;
  const { reaction_type = "like" } = req.body;
  if (!VALID_REACTIONS.includes(reaction_type)) {
    return res.status(400).json({ success: false, message: "Invalid reaction type" });
  }
  try {
    const existing = await query(
      "SELECT id, reaction_type FROM personal_post_likes WHERE post_id = $1 AND user_id = $2",
      [post_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].reaction_type === reaction_type) {
        await query("DELETE FROM personal_post_likes WHERE id = $1", [existing.rows[0].id]);
        return res.json({ success: true, data: { reaction: null } });
      }
      await query("UPDATE personal_post_likes SET reaction_type = $1 WHERE id = $2", [reaction_type, existing.rows[0].id]);
      return res.json({ success: true, data: { reaction: reaction_type } });
    }
    await query(
      "INSERT INTO personal_post_likes (post_id, user_id, reaction_type) VALUES ($1, $2, $3)",
      [post_id, req.user.id, reaction_type]
    );
    res.json({ success: true, data: { reaction: reaction_type } });
  } catch (error) {
    logger.error("Toggle personal reaction error:", error);
    res.status(500).json({ success: false, message: "Failed to update reaction" });
  }
};

// ─── Toggle Reaction on a Comment (any Personal user - Free or Paid) ──

exports.toggleCommentReaction = async (req, res) => {
  const { comment_id } = req.params;
  const { reaction_type = "like" } = req.body;
  if (!VALID_REACTIONS.includes(reaction_type)) {
    return res.status(400).json({ success: false, message: "Invalid reaction type" });
  }
  try {
    const comment = await query(
      "SELECT post_id FROM personal_post_comments WHERE id = $1 LIMIT 1",
      [comment_id]
    );

    if (
      comment.rows.length === 0 ||
      !(await isPersonalPostVisibleToUser(
        comment.rows[0].post_id,
        req.user.id
      ))
    ) {
      return res.status(404).json({
        success: false,
        message: "Comment not found"
      });
    }

    const existing = await query(
      "SELECT id, reaction_type FROM personal_post_comment_reactions WHERE comment_id = $1 AND user_id = $2",
      [comment_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].reaction_type === reaction_type) {
        await query("DELETE FROM personal_post_comment_reactions WHERE id = $1", [existing.rows[0].id]);
        return res.json({ success: true, data: { reaction: null } });
      }
      await query("UPDATE personal_post_comment_reactions SET reaction_type = $1 WHERE id = $2", [reaction_type, existing.rows[0].id]);
      return res.json({ success: true, data: { reaction: reaction_type } });
    }
    await query(
      "INSERT INTO personal_post_comment_reactions (comment_id, user_id, reaction_type) VALUES ($1, $2, $3)",
      [comment_id, req.user.id, reaction_type]
    );
    res.json({ success: true, data: { reaction: reaction_type } });
  } catch (error) {
    logger.error("Toggle personal comment reaction error:", error);
    res.status(500).json({ success: false, message: "Failed to update reaction" });
  }
};

// ─── List Comments (any Personal user - Free or Paid) ────────────

exports.listComments = async (req, res) => {
  const { post_id } = req.params;
  try {
    if (!(await isPersonalPostVisibleToUser(post_id, req.user.id))) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    const result = await query(
      `SELECT c.*, u.first_name, u.last_name,
              (SELECT json_object_agg(reaction_type, cnt) FROM (
                SELECT reaction_type, COUNT(*) as cnt FROM personal_post_comment_reactions
                WHERE comment_id = c.id GROUP BY reaction_type
              ) sub) as reaction_counts,
              (SELECT reaction_type FROM personal_post_comment_reactions WHERE comment_id = c.id AND user_id = $2) as my_reaction
       FROM personal_post_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [post_id, req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List personal comments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch comments" });
  }
};

// ─── Add Comment or Reply (Paid Personal subscribers only) ──────
// parent_comment_id optional - present means this is a reply. Same
// any-depth model as the Agent side: a reply to a reply attaches to
// that reply's own id directly, and the client renders the resulting
// chain recursively.

exports.addComment = async (req, res) => {
  const { post_id } = req.params;
  const { content, parent_comment_id } = req.body;
  const trimmed = (content || "").trim();

  if (!trimmed) {
    return res.status(422).json({ success: false, message: "Comment content is required" });
  }

  try {
    if (!(await isPersonalPostVisibleToUser(post_id, req.user.id))) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    if (parent_comment_id) {
      const parent = await query(
        "SELECT id FROM personal_post_comments WHERE id = $1 AND post_id = $2",
        [parent_comment_id, post_id]
      );
      if (parent.rows.length === 0) {
        return res.status(422).json({ success: false, message: "Invalid parent comment for this post" });
      }
    }

    const result = await query(
      "INSERT INTO personal_post_comments (post_id, author_id, content, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [post_id, req.user.id, trimmed, parent_comment_id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Add personal comment error:", error);
    res.status(500).json({ success: false, message: "Failed to add comment" });
  }
};
