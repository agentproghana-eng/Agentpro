const express = require('express');
const router = express.Router();
const personalCommunityController = require('../controllers/personalCommunityController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Baseline gate for the whole Personal Community: must have Personal
// capability enabled at all. Free vs Paid is applied per-route below,
// only where it actually differs - viewing and reacting (to both posts
// and comments) are available on the free plan too, per spec; only
// creating a post or adding a comment/reply requires Paid.
router.use(authenticate, requirePersonalAccount);

router.get('/feed', personalCommunityController.listFeed);
router.post('/posts', requirePaidPersonalPlan, personalCommunityController.createPost);
router.post('/posts/:post_id/react', personalCommunityController.toggleLike);
router.get('/posts/:post_id/comments', personalCommunityController.listComments);
router.post('/posts/:post_id/comments', requirePaidPersonalPlan, personalCommunityController.addComment);
router.post('/comments/:comment_id/react', personalCommunityController.toggleCommentReaction);

module.exports = router;
