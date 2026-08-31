const express = require('express');
const router = express.Router();
const multer = require('multer');
const personalCommunityController = require('../controllers/personalCommunityController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Same multer config as Agent's agentPost.routes.js exactly: memory
// storage (buffer piped straight to Cloudinary, no local disk writes),
// 10MB cap, audio MIME types only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Baseline gate for the whole Personal Community: must have Personal
// capability enabled at all. Free vs Paid is applied per-route below,
// only where it actually differs - viewing and reacting (to both posts
// and comments) are available on the free plan too, per spec; only
// creating a post or adding a comment/reply requires Paid.
router.use(authenticate, requirePersonalAccount);

router.get('/feed', personalCommunityController.listFeed);
router.get('/posts/:post_id', personalCommunityController.getPost);
router.post('/posts', requirePaidPersonalPlan, upload.single('audio'), personalCommunityController.createPost);
router.post('/posts/:post_id/react', personalCommunityController.toggleLike);
router.get('/posts/:post_id/comments', personalCommunityController.listComments);
router.post('/posts/:post_id/comments', requirePaidPersonalPlan, upload.single('audio'), personalCommunityController.addComment);
router.post('/comments/:comment_id/react', personalCommunityController.toggleCommentReaction);

module.exports = router;
