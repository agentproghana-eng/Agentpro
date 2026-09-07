const express = require('express');
const router = express.Router();
const multer = require('multer');
const personalCommunityController = require('../controllers/personalCommunityController');
const { authenticate, authorize, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');

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

// Authenticate first. Superuser moderation routes are deliberately
// registered before the Personal-account capability gate so platform
// administrators can review Personal Community content without needing
// a Personal subscription or Personal capability themselves.
router.use(authenticate);

router.get(
  '/moderation/pending',
  authorize('superuser'),
  personalCommunityController.listPending
);

router.patch(
  '/posts/:post_id/moderate',
  authorize('superuser'),
  personalCommunityController.moderatePost
);

// Baseline gate for Personal Community member routes. Free vs Paid is
// still applied per-route below exactly as before.
router.use(requirePersonalAccount);

router.get('/feed', personalCommunityController.listFeed);
router.get('/posts/:post_id', personalCommunityController.getPost);
router.post('/posts', requirePaidPersonalPlan, uploadLimiter, upload.single('audio'), personalCommunityController.createPost);
router.post('/posts/:post_id/react', personalCommunityController.toggleLike);
router.get('/posts/:post_id/comments', personalCommunityController.listComments);
router.post('/posts/:post_id/comments', requirePaidPersonalPlan, uploadLimiter, upload.single('audio'), personalCommunityController.addComment);
router.post('/comments/:comment_id/react', personalCommunityController.toggleCommentReaction);

module.exports = router;
