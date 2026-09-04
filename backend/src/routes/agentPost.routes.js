const express = require("express");
const router = express.Router();
const multer = require("multer");
const agentPostController = require("../controllers/agentPostController");
const enhancementController = require("../controllers/agentCommunityEnhancementController");
const { authenticate, authorize, requireActiveSubscription } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimit");

// Voice notes: memoryStorage (no local disk writes - the buffer is
// piped straight to Cloudinary), capped at 10MB (a few minutes of
// compressed audio), audio MIME types only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

router.use(authenticate);

// Superuser moderation routes must be registered before the
// business-role restriction below.
router.get(
  "/moderation/posts",
  authorize("superuser"),
  enhancementController.listModerationPosts
);
router.get(
  "/moderation/history",
  authorize("superuser"),
  enhancementController.listModerationHistory
);
router.get(
  "/moderation/reports",
  authorize("superuser"),
  enhancementController.listReports
);
router.patch(
  "/moderation/reports/:report_id",
  authorize("superuser"),
  enhancementController.resolveReport
);
router.get(
  "/moderation/pending",
  authorize("superuser"),
  agentPostController.listPending
);
router.patch(
  "/:post_id/community-moderation",
  authorize("superuser"),
  enhancementController.updatePostModeration
);
router.patch(
  "/:post_id/moderate",
  authorize("superuser"),
  agentPostController.moderatePost
);

// Agent Community member routes.
router.use(
  authorize("business_owner", "manager", "agent")
);

// Static routes must appear before /:post_id.
router.get("/saved", enhancementController.listSavedPosts);
router.get("/blocked-users", enhancementController.listBlockedUsers);

router.post(
  "/users/:user_id/block",
  enhancementController.blockUser
);
router.delete(
  "/users/:user_id/block",
  enhancementController.unblockUser
);

router.get("/", agentPostController.listFeed);
router.get("/:post_id", agentPostController.getPost);
router.post("/", requireActiveSubscription, uploadLimiter, upload.single("audio"), agentPostController.createPost);
router.post("/:post_id/save", enhancementController.savePost);
router.delete("/:post_id/save", enhancementController.unsavePost);
router.post("/:post_id/report", enhancementController.reportPost);
router.patch(
  "/:post_id/accepted-answer",
  enhancementController.acceptAnswer
);
router.delete(
  "/:post_id/accepted-answer",
  enhancementController.clearAcceptedAnswer
);
router.delete("/:post_id", agentPostController.deletePost);
router.post("/:post_id/like", requireActiveSubscription, agentPostController.toggleLike);
router.get("/:post_id/comments", agentPostController.listComments);
router.post("/:post_id/comments", requireActiveSubscription, uploadLimiter, upload.single("audio"), agentPostController.addComment);
router.post(
  "/comments/:comment_id/react",
  requireActiveSubscription,
  agentPostController.toggleCommentReaction
);
router.post(
  "/comments/:comment_id/report",
  enhancementController.reportComment
);

module.exports = router;
