const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');
const {
  aiLimiter,
} = require('../middleware/rateLimit');

router.use(authenticate, aiLimiter);

router.post('/chat', [
  body('message').trim().notEmpty().isLength({ max: 2000 }).withMessage('Message is required (max 2000 chars)'),
], aiController.chat);

router.get('/conversations', aiController.listConversations);
router.get('/conversations/:conversation_id', aiController.getConversation);

module.exports = router;
