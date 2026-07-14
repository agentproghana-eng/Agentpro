const express = require("express");
const router = express.Router();
const agentPostController = require("../controllers/agentPostController");
const { authenticate, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(authenticate);

router.get("/", agentPostController.listFeed);
router.post("/", requireActiveSubscription, agentPostController.createPost);
router.delete("/:post_id", agentPostController.deletePost);
router.post("/:post_id/like", requireActiveSubscription, agentPostController.toggleLike);
router.get("/:post_id/comments", agentPostController.listComments);
router.post("/:post_id/comments", requireActiveSubscription, agentPostController.addComment);

router.get("/moderation/pending", authorize("superuser"), agentPostController.listPending);
router.patch("/:post_id/moderate", authorize("superuser"), agentPostController.moderatePost);

module.exports = router;
