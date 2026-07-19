const express = require("express");
const router = express.Router();
const multer = require("multer");
const agentPostController = require("../controllers/agentPostController");
const { authenticate, authorize, requireActiveSubscription } = require("../middleware/auth");

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

router.get("/", agentPostController.listFeed);
router.post("/", requireActiveSubscription, upload.single("audio"), agentPostController.createPost);
router.delete("/:post_id", agentPostController.deletePost);
router.post("/:post_id/like", requireActiveSubscription, agentPostController.toggleLike);
router.get("/:post_id/comments", agentPostController.listComments);
router.post("/:post_id/comments", requireActiveSubscription, agentPostController.addComment);

router.get("/moderation/pending", authorize("superuser"), agentPostController.listPending);
router.patch("/:post_id/moderate", authorize("superuser"), agentPostController.moderatePost);

module.exports = router;
