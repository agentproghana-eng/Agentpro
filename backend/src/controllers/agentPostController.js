const Anthropic = require("@anthropic-ai/sdk");
const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");
const { uploadAudio } = require("../config/cloudinary");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Checks whether a post reads like an advertisement. Fails safe: if
// the AI check itself fails, the post is treated as NOT flagged
// (goes live normally) rather than silently blocking every post.
async function detectAdvertisement(content) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 20,
      system: "You moderate a community feed for mobile money agents in Ghana. Reply with only YES or NO: does the following post read like an advertisement or promotion for a product, service, or business (as opposed to a genuine question, tip, or discussion)?",
      messages: [{ role: "user", content }],
    });
    const answer = (response.content[0]?.text || "").trim().toUpperCase();
    return answer.startsWith("YES");
  } catch (error) {
    logger.error("Ad detection error:", error);
    return false;
  }
}

// Posts can be text, a voice note, or both - never neither. Voice-only
// posts (no text at all) deliberately skip the AI ad-detection check
// below: there is no transcription pipeline to run that check against,
// so a voice-only post publishes immediately as 'active' regardless of
// its actual content. This is a known, explicit tradeoff made when
// voice notes were added (see migration 009/010), not an oversight -
// audio moderation would require a separate transcription step that
// doesn't exist yet.
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
      const filename = `${req.user.id}_${Date.now()}`;
      audioUrl = await uploadAudio(audioFile.buffer, filename);
    }

    let isAd = false;
    if (trimmed) {
      isAd = await detectAdvertisement(trimmed);
    }
    const status = isAd ? "pending_review" : "active";

    const result = await query(
      "INSERT INTO agent_posts (author_id, content, audio_url, status, flagged_reason) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, trimmed || null, audioUrl, status, isAd ? "AI flagged as advertisement" : null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: isAd
        ? "Your post is under review and will appear once approved."
        : "Posted",
    });
  } catch (error) {
    logger.error("Create post error:", error);
    res.status(500).json({ success: false, message: "Failed to create post" });
  }
};

// Public feed: active posts from everyone, plus the requesting user's
// own pending_review posts (so authors see their own "under review"
// posts even though nobody else can).
exports.listFeed = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const result = await query(
      `SELECT p.*, u.first_name, u.last_name, u.role,
              (SELECT COUNT(*) FROM agent_post_likes l WHERE l.post_id = p.id) as like_count,
              (SELECT COUNT(*) FROM agent_post_comments c WHERE c.post_id = p.id) as comment_count,
              EXISTS(SELECT 1 FROM agent_post_likes l WHERE l.post_id = p.id AND l.user_id = $1) as liked_by_me
       FROM agent_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.status = $2 OR (p.status = $3 AND p.author_id = $1)
       ORDER BY p.created_at DESC
       LIMIT $4 OFFSET $5`,
      [req.user.id, "active", "pending_review", parseInt(limit), offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List feed error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch feed" });
  }
};

exports.toggleLike = async (req, res) => {
  const { post_id } = req.params;
  try {
    const existing = await query(
      "SELECT id FROM agent_post_likes WHERE post_id = $1 AND user_id = $2",
      [post_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      await query("DELETE FROM agent_post_likes WHERE id = $1", [existing.rows[0].id]);
      return res.json({ success: true, data: { liked: false } });
    }
    await query(
      "INSERT INTO agent_post_likes (post_id, user_id) VALUES ($1, $2)",
      [post_id, req.user.id]
    );
    res.json({ success: true, data: { liked: true } });
  } catch (error) {
    logger.error("Toggle like error:", error);
    res.status(500).json({ success: false, message: "Failed to update like" });
  }
};

// Returns a flat list ordered oldest-first, with parent_comment_id
// (NULL for a top-level comment) included via c.* - the frontend
// builds the reply tree from this flat list rather than the backend
// nesting it, keeping this endpoint simple and the shape stable.
exports.listComments = async (req, res) => {
  const { post_id } = req.params;
  try {
    const result = await query(
      `SELECT c.*, u.first_name, u.last_name, u.role
       FROM agent_post_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [post_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List comments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch comments" });
  }
};

// parent_comment_id is optional - present means this is a reply.
// Deliberately only one level of threading is enforced here: if the
// referenced parent comment is itself a reply (has its own
// parent_comment_id), this still attaches the new comment directly to
// it rather than rejecting - the frontend is expected to flatten
// display to one reply level, matching most social apps' UX, but nothing
// here prevents deeper nesting at the data level.
exports.addComment = async (req, res) => {
  const { post_id } = req.params;
  const { content, parent_comment_id } = req.body;
  const trimmed = (content || "").trim();
  if (!trimmed) {
    return res.status(422).json({ success: false, message: "Comment content is required" });
  }

  try {
    if (parent_comment_id) {
      const parent = await query(
        "SELECT id FROM agent_post_comments WHERE id = $1 AND post_id = $2",
        [parent_comment_id, post_id]
      );
      if (parent.rows.length === 0) {
        return res.status(422).json({ success: false, message: "Invalid parent comment for this post" });
      }
    }

    const result = await query(
      "INSERT INTO agent_post_comments (post_id, author_id, content, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [post_id, req.user.id, trimmed, parent_comment_id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Add comment error:", error);
    res.status(500).json({ success: false, message: "Failed to add comment" });
  }
};

exports.listPending = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.first_name, u.last_name, u.role
       FROM agent_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.status = $1
       ORDER BY p.created_at ASC`,
      ["pending_review"]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List pending posts error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending posts" });
  }
};

exports.moderatePost = async (req, res) => {
  const { post_id } = req.params;
  const { action, removed_reason } = req.body;
  if (!["approve", "reject"].includes(action)) {
    return res.status(422).json({ success: false, message: "action must be approve or reject" });
  }
  try {
    const newStatus = action === "approve" ? "active" : "removed";
    const result = await query(
      "UPDATE agent_posts SET status = $1, reviewed_by = $2, reviewed_at = NOW(), removed_reason = $3 WHERE id = $4 AND status = $5 RETURNING *",
      [newStatus, req.user.id, removed_reason || null, post_id, "pending_review"]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Pending post not found" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Moderate post error:", error);
    res.status(500).json({ success: false, message: "Failed to review post" });
  }
};

exports.deletePost = async (req, res) => {
  const { post_id } = req.params;
  try {
    const post = await query("SELECT author_id FROM agent_posts WHERE id = $1", [post_id]);
    if (post.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }
    const isAuthor = post.rows[0].author_id === req.user.id;
    const isSuperuser = req.user.role === "superuser";
    if (!isAuthor && !isSuperuser) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    await query(
      "UPDATE agent_posts SET status = $1, reviewed_by = $2, reviewed_at = NOW(), removed_reason = $3 WHERE id = $4",
      ["removed", req.user.id, isAuthor && !isSuperuser ? "Deleted by author" : "Removed by superuser", post_id]
    );
    res.json({ success: true, message: "Post removed" });
  } catch (error) {
    logger.error("Delete post error:", error);
    res.status(500).json({ success: false, message: "Failed to delete post" });
  }
};
