const express = require('express');

const {
  body,
  param,
  validationResult,
} = require('express-validator');

const {
  authenticate,
} = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

const controller = require(
  '../controllers/communityServiceRequestController'
);

const router = express.Router();

function validate(
  req,
  res,
  next
) {
  const errors =
    validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      code:
        'COMMUNITY_SERVICE_VALIDATION_FAILED',
      message:
        'Check the service request details and try again.',
      errors:
        errors.array(),
    });
  }

  next();
}

const requestIdValidation = [
  param('request_id')
    .isUUID()
    .withMessage(
      'Invalid service request.'
    ),
];

function validateModerationInput(
  req,
  res,
  next
) {
  const errors =
    validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      errors: errors.array(),
    });
  }

  return next();
}

router.use(authenticate);

router.get(
  '/categories',
  controller.listCategories
);

router.get(
  '/provider/profile',
  controller.getProviderProfile
);

router.put(
  '/provider/profile',
  [
body('bio')
      .optional({
        nullable: true,
      })
      .trim()
      .isLength({
        max: 1000,
      }),

    body('area_label')
      .trim()
      .isLength({
        min: 2,
        max: 160,
      }),

    body('latitude')
      .isFloat({
        min: -90,
        max: 90,
      }),

    body('longitude')
      .isFloat({
        min: -180,
        max: 180,
      }),

    body('service_radius_km')
      .isFloat({
        min: 1,
        max: 50,
      }),

    body('category_ids')
      .isArray({
        min: 1,
        max: 20,
      }),

    body('category_ids.*')
      .isUUID(),
  ],
  validate,
  controller.upsertProviderProfile
);

router.get(
  '/provider/requests',
  controller.listProviderRequests
);

router.post(
  '/requests',
  [
    body('category_id')
      .isUUID(),

    body('title')
      .trim()
      .isLength({
        min: 5,
        max: 140,
      }),

    body('description')
      .trim()
      .isLength({
        min: 10,
        max: 2000,
      }),

    body('area_label')
      .trim()
      .isLength({
        min: 2,
        max: 160,
      }),

    body('latitude')
      .isFloat({
        min: -90,
        max: 90,
      }),

    body('longitude')
      .isFloat({
        min: -180,
        max: 180,
      }),

    body('search_radius_km')
      .isFloat({
        min: 1,
        max: 50,
      }),
  ],
  validate,
  controller.createRequest
);

router.get(
  '/requests',
  controller.listOwnRequests
);

router.post(
  '/requests/:request_id/discover',
  requestIdValidation,
  validate,
  controller.discoverProviders
);

router.get(
  '/requests/:request_id/offers',
  requestIdValidation,
  validate,
  controller.listOffers
);

router.post(
  '/requests/:request_id/offers',
  [
    ...requestIdValidation,

    body('message')
      .trim()
      .isLength({
        min: 2,
        max: 1000,
      }),

    body('price_amount')
      .optional({
        nullable: true,
      })
      .isFloat({
        min: 0,
        max: 1000000000,
      }),

    body('availability_note')
      .optional({
        nullable: true,
      })
      .trim()
      .isLength({
        max: 300,
      }),
  ],
  validate,
  controller.submitOffer
);

router.post(
  '/requests/:request_id/offers/:offer_id/select',
  [
    ...requestIdValidation,

    param('offer_id')
      .isUUID()
      .withMessage(
        'Invalid service offer.'
      ),
  ],
  validate,
  controller.selectOffer
);

router.post(
  '/requests/:request_id/start',
  requestIdValidation,
  validate,
  controller.startRequest
);

router.post(
  '/requests/:request_id/complete',
  requestIdValidation,
  validate,
  controller.completeRequest
);

router.post(
  '/requests/:request_id/review',
  [
    ...requestIdValidation,

    body('rating')
      .isInt({
        min: 1,
        max: 5,
      }),

    body('comment')
      .optional({
        nullable: true,
      })
      .trim()
      .isLength({
        max: 1000,
      }),
  ],
  validate,
  controller.reviewRequest
);


router.post(
  '/requests/:request_id/report',
  [
    param('request_id').isUUID(),
    body('reason').isIn([
      'spam',
      'fraud',
      'harassment',
      'misinformation',
      'inappropriate',
      'privacy',
      'other',
    ]),
    body('details')
      .optional({
        nullable: true,
      })
      .isString()
      .isLength({
        max: 2000,
      }),
  ],
  validateModerationInput,
  controller.reportRequest
);

router.get(
  '/moderation/reports',
  authorize('superuser'),
  controller.listModerationReports
);

router.patch(
  '/moderation/reports/:report_id',
  authorize('superuser'),
  [
    param('report_id').isUUID(),
    body('status').isIn([
      'reviewed',
      'dismissed',
      'actioned',
    ]),
    body('resolution_note')
      .optional({
        nullable: true,
      })
      .isString()
      .isLength({
        max: 2000,
      }),
  ],
  validateModerationInput,
  controller.resolveModerationReport
);

router.patch(
  '/moderation/requests/:request_id',
  authorize('superuser'),
  [
    param('request_id').isUUID(),
    body('content_status').isIn([
      'active',
      'pending_review',
      'removed',
    ]),
    body('reason')
      .optional({
        nullable: true,
      })
      .isString()
      .isLength({
        max: 2000,
      }),
  ],
  validateModerationInput,
  controller.moderateRequest
);

module.exports = router;
