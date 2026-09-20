const express = require('express');

const {
  body,
  param,
  validationResult,
} = require('express-validator');

const {
  authenticate,
} = require('../middleware/auth');

const {
  auditLog,
} = require('../services/auditService');

const {
  createSupportCase,
  listOwnSupportCases,
  getOwnSupportCase,
} = require('../services/supportCaseService');

const {
  logger,
} = require('../utils/logger');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      code: 'SUPPORT_CASE_VALIDATION_FAILED',
      message: 'Check the support request and try again.',
      errors: errors.array(),
    });
  }

  return next();
}

function failure(res, error) {
  const status = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;

  if (status === 500) {
    logger.error('Support case request failed', {
      errorCode: error?.code,
    });
  }

  return res.status(status).json({
    success: false,
    code: error?.code,
    message:
      status === 500
        ? 'Support is temporarily unavailable. Please try again.'
        : error.message,
  });
}

router.use(authenticate);

router.post(
  '/cases',
  [
    body('type').isIn([
      'complaint',
      'feedback',
      'suggestion',
    ]),
    body('subject').trim().isLength({
      min: 3,
      max: 120,
    }),
    body('message').trim().isLength({
      min: 10,
      max: 4000,
    }),
  ],
  validate,
  async (req, res) => {
    try {
      const supportCase = await createSupportCase({
        requesterUserId: req.user.id,
        companyId: req.user.company_id || null,
        type: req.body.type,
        subject: req.body.subject,
        message: req.body.message,
        source: 'mobile',
        appVersion: req.get('X-AgentPro-App-Version'),
        appBuild: req.get('X-AgentPro-App-Build'),
        platform: req.get('X-AgentPro-Platform'),
        sourceCommit: req.get('X-AgentPro-Source-Commit'),
      });

      // Metadata only: never duplicate complaint text into the broad audit log.
      await auditLog({
        userId: req.user.id,
        companyId: req.user.company_id || null,
        action: 'SUPPORT_CASE_CREATED',
        entityType: 'support_case',
        entityId: supportCase.id,
        newValues: {
          reference: supportCase.reference,
          type: supportCase.type,
          status: supportCase.status,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
      });

      return res.status(201).json({
        success: true,
        message: 'Your message has been received by AgentPro Support.',
        data: supportCase,
      });
    } catch (error) {
      return failure(res, error);
    }
  }
);

router.get('/cases', async (req, res) => {
  try {
    const cases = await listOwnSupportCases({
      requesterUserId: req.user.id,
    });

    return res.json({
      success: true,
      data: { cases },
    });
  } catch (error) {
    return failure(res, error);
  }
});

router.get(
  '/cases/:case_id',
  [
    param('case_id').isUUID(),
  ],
  validate,
  async (req, res) => {
    try {
      const result = await getOwnSupportCase({
        requesterUserId: req.user.id,
        caseId: req.params.case_id,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return failure(res, error);
    }
  }
);

module.exports = router;
