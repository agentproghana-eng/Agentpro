const { GoogleGenerativeAI } = require("@google/generative-ai");
const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");
const { uploadAudio } = require("../config/cloudinary");

// Swapped from Anthropic to Google's free-tier Gemini API - same
// reason as aiController.js's chat assistant (billing issue on the
// Anthropic key). This is a single-shot YES/NO classification, so no
// conversation history is needed - just systemInstruction + one prompt.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Checks whether a post reads like an advertisement. Fails safe: if
// the AI check itself fails, the post is treated as NOT flagged
// (goes live normally) rather than silently blocking every post.
async function detectAdvertisement(content) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: "You moderate a community feed for mobile money agents in Ghana. Reply with only YES or NO: does the following post read like an advertisement or promotion for a product, service, or business (as opposed to a genuine question, tip, or discussion)?",
    });
    const result = await model.generateContent(content);
    const answer = (result.response.text() || "").trim().toUpperCase();
    return answer.startsWith("YES");
  } catch (error) {
    logger.error("Ad detection error:", error);
    return false;
  }
}

// Exported so the Personal Community controller can reuse the same
// check rather than duplicate the moderation prompt/logic.
exports.detectAdvertisement = detectAdvertisement;

// Posts can be text, a voice note, or both - never neither. Voice-only
// posts (no text at all) deliberately skip the AI ad-detection check
// below: there is no transcription pipeline to run that check against,
// so a voice-only post publishes immediately as 'active' regardless of
// its actual content. This is a known, explicit tradeoff made when
// voice notes were added (see migration 009/010), not an oversight -
// audio moderation would require a separate transcription step that
// doesn't exist yet.
exports.createPost = async (req, res) => {
  const { content, post_type = "general" } = req.body;
  const trimmed = (content || "").trim();
  const audioFile = req.file;

  if (!trimmed && !audioFile) {
    return res.status(422).json({
      success: false,
      message: "Post content or a voice note is required",
    });
  }

  const validPostTypes = [
    "general",
    "question",
    "network_issue",
    "fraud_alert",
    "business_tip",
    "announcement",
  ];

  if (!validPostTypes.includes(post_type)) {
    return res.status(422).json({
      success: false,
      message: "Invalid post type",
    });
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
      `INSERT INTO agent_posts (
         author_id,
         content,
         audio_url,
         status,
         flagged_reason,
         post_type
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.id,
        trimmed || null,
        audioUrl,
        status,
        isAd ? "AI flagged as advertisement" : null,
        post_type,
      ]
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
  const parsedPage = Number.parseInt(req.query.page, 10);
  const parsedLimit = Number.parseInt(req.query.limit, 10);

  const page =
    Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 20;

  const offset = (page - 1) * limit;

  const validTypes = new Set([
    "general",
    "question",
    "network_issue",
    "fraud_alert",
    "business_tip",
    "announcement",
  ]);

  const requestedType = req.query.type?.toString();
  const postType =
    requestedType && validTypes.has(requestedType)
      ? requestedType
      : null;

  try {
    const result = await query(
      `SELECT
         p.*,
         u.first_name,
         u.last_name,
         u.role,

         EXISTS (
           SELECT 1
           FROM agent_saved_posts saved
           WHERE saved.post_id = p.id
             AND saved.user_id = $1
         ) AS is_saved,

         (
           SELECT json_object_agg(reaction_type, cnt)
           FROM (
             SELECT
               reaction_type,
               COUNT(*)::int AS cnt
             FROM agent_post_likes
             WHERE post_id = p.id
             GROUP BY reaction_type
           ) reaction_summary
         ) AS reaction_counts,

         (
           SELECT COUNT(*)::int
           FROM agent_post_comments comment
           WHERE comment.post_id = p.id
         ) AS comment_count,

         (
           SELECT reaction_type
           FROM agent_post_likes reaction
           WHERE reaction.post_id = p.id
             AND reaction.user_id = $1
         ) AS my_reaction

       FROM agent_posts p
       INNER JOIN users u
         ON u.id = p.author_id

       WHERE (
         p.status = 'active'
         OR (
           p.status = 'pending_review'
           AND p.author_id = $1
         )
       )
       AND (
         $2::community_post_type IS NULL
         OR p.post_type = $2
       )
       AND NOT EXISTS (
         SELECT 1
         FROM agent_community_blocks block
         WHERE block.blocker_id = $1
           AND block.blocked_user_id = p.author_id
       )

       ORDER BY
         p.is_pinned DESC,
         p.is_urgent DESC,
         p.created_at DESC

       LIMIT $3 OFFSET $4`,
      [
        req.user.id,
        postType,
        limit,
        offset,
      ]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        has_more: result.rows.length === limit,
      },
    });
  } catch (error) {
    logger.error("List feed error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch feed",
    });
  }
};


const VALID_REACTIONS = ["like", "love", "laugh", "wow", "sad", "pray", "dislike"];

exports.toggleLike = async (req, res) => {
  const { post_id } = req.params;
  const { reaction_type = "like" } = req.body;
  if (!VALID_REACTIONS.includes(reaction_type)) {
    return res.status(400).json({ success: false, message: "Invalid reaction type" });
  }
  try {
    const existing = await query(
      "SELECT id, reaction_type FROM agent_post_likes WHERE post_id = $1 AND user_id = $2",
      [post_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].reaction_type === reaction_type) {
        await query("DELETE FROM agent_post_likes WHERE id = $1", [existing.rows[0].id]);
        return res.json({ success: true, data: { reaction: null } });
      }
      await query("UPDATE agent_post_likes SET reaction_type = $1 WHERE id = $2", [reaction_type, existing.rows[0].id]);
      return res.json({ success: true, data: { reaction: reaction_type } });
    }
    await query(
      "INSERT INTO agent_post_likes (post_id, user_id, reaction_type) VALUES ($1, $2, $3)",
      [post_id, req.user.id, reaction_type]
    );
    res.json({ success: true, data: { reaction: reaction_type } });
  } catch (error) {
    logger.error("Toggle reaction error:", error);
    res.status(500).json({ success: false, message: "Failed to update reaction" });
  }
};

// Mirrors toggleLike exactly, just against agent_post_comment_reactions
// instead of agent_post_likes - comments get the same 7-reaction
// capability posts have.
exports.toggleCommentReaction = async (req, res) => {
  const { comment_id } = req.params;
  const { reaction_type = "like" } = req.body;
  if (!VALID_REACTIONS.includes(reaction_type)) {
    return res.status(400).json({ success: false, message: "Invalid reaction type" });
  }
  try {
    const existing = await query(
      "SELECT id, reaction_type FROM agent_post_comment_reactions WHERE comment_id = $1 AND user_id = $2",
      [comment_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].reaction_type === reaction_type) {
        await query("DELETE FROM agent_post_comment_reactions WHERE id = $1", [existing.rows[0].id]);
        return res.json({ success: true, data: { reaction: null } });
      }
      await query("UPDATE agent_post_comment_reactions SET reaction_type = $1 WHERE id = $2", [reaction_type, existing.rows[0].id]);
      return res.json({ success: true, data: { reaction: reaction_type } });
    }
    await query(
      "INSERT INTO agent_post_comment_reactions (comment_id, user_id, reaction_type) VALUES ($1, $2, $3)",
      [comment_id, req.user.id, reaction_type]
    );
    res.json({ success: true, data: { reaction: reaction_type } });
  } catch (error) {
    logger.error("Toggle comment reaction error:", error);
    res.status(500).json({ success: false, message: "Failed to update reaction" });
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
      `SELECT c.*, u.first_name, u.last_name, u.role,
              (SELECT json_object_agg(reaction_type, cnt) FROM (
                SELECT reaction_type, COUNT(*) as cnt FROM agent_post_comment_reactions
                WHERE comment_id = c.id GROUP BY reaction_type
              ) sub) as reaction_counts,
              (SELECT reaction_type FROM agent_post_comment_reactions WHERE comment_id = c.id AND user_id = $2) as my_reaction
       FROM agent_post_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [post_id, req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List comments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch comments" });
  }
};

// parent_comment_id is optional - present means this is a reply.
// Replies can go to any depth - a reply to a reply attaches to that
// reply's id directly, and the frontend renders the resulting chain
// recursively rather than flattening to one level.
exports.addComment = async (req, res) => {
  const { post_id } = req.params;
  const { content, parent_comment_id } = req.body;
  const trimmed = (content || "").trim();
  const audioFile = req.file;

  if (!trimmed && !audioFile) {
    return res.status(422).json({ success: false, message: "Comment content or a voice note is required" });
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

    let audioUrl = null;
    if (audioFile) {
      const filename = `${req.user.id}_comment_${Date.now()}`;
      audioUrl = await uploadAudio(audioFile.buffer, filename);
    }

    const result = await query(
      "INSERT INTO agent_post_comments (post_id, author_id, content, audio_url, parent_comment_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [post_id, req.user.id, trimmed || null, audioUrl, parent_comment_id || null]
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
