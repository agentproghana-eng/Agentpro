const express =
  require('express');

const router =
  express.Router();

const {
  body,
  validationResult,
} = require(
  'express-validator',
);

const aiController =
  require(
    '../controllers/aiController',
  );

const {
  authenticate,
} = require(
  '../middleware/auth',
);

const {
  aiLimiter,
} = require(
  '../middleware/rateLimit',
);

const handleValidation =
  (req, res, next) => {
    const errors =
      validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({
          success: false,
          message:
            'Validation failed',
          errors:
            errors
              .array()
              .map(
                (error) => ({
                  field:
                    error.path,
                  message:
                    error.msg,
                }),
              ),
        });
    }

    next();
  };

router.use(
  authenticate,
  aiLimiter,
);

router.post(
  '/chat',
  [
    body('message')
      .trim()
      .notEmpty()
      .isLength({
        max: 2000,
      })
      .withMessage(
        'Message is required (max 2000 chars)',
      ),

    body('mode')
      .isIn([
        'personal',
        'business',
      ])
      .withMessage(
        'Mode must be personal or business',
      ),

    body('conversation_id')
      .optional()
      .isUUID()
      .withMessage(
        'Invalid conversation ID',
      ),
  ],
  handleValidation,
  aiController.chat,
);

router.get(
  '/conversations',
  aiController.listConversations,
);

router.get(
  '/conversations/:conversation_id',
  aiController.getConversation,
);

module.exports = router;
