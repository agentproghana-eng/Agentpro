const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const {
  authLimiter,
  refreshLimiter,
  personalPhoneVerificationSendLimiter,
  personalPhoneVerificationVerifyLimiter,
} = require('../middleware/rateLimit');

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// POST /api/v1/auth/register
router.post('/register', authLimiter, [
  body('company_name').trim().notEmpty().withMessage('Company name is required'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
], handleValidation, authController.register);

// POST /api/v1/auth/personal-phone-verification/start
router.post(
  "/personal-phone-verification/start",
  personalPhoneVerificationSendLimiter,
  [
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
    body("installation_id")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isUUID()
      .withMessage("Invalid installation identity"),
    body("sim_iccid")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isString()
      .trim()
      .custom((value) => /^\d{10,25}$/.test(String(value).replace(/\s/g, "")))
      .withMessage("Invalid SIM identity"),
  ],
  handleValidation,
  authController.startPersonalPhoneVerification,
);

// POST /api/v1/auth/personal-phone-verification/verify
router.post(
  "/personal-phone-verification/verify",
  personalPhoneVerificationVerifyLimiter,
  [
    body("challenge_token")
      .isString()
      .isLength({
        min: 40,
        max: 200,
      })
      .withMessage("Valid verification challenge is required"),
    body("code")
      .isString()
      .matches(/^\d{6}$/)
      .withMessage("Verification code must be exactly 6 digits"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
    body("installation_id")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isUUID()
      .withMessage("Invalid installation identity"),
    body("sim_iccid")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isString()
      .trim()
      .custom((value) => /^\d{10,25}$/.test(String(value).replace(/\s/g, "")))
      .withMessage("Invalid SIM identity"),
  ],
  handleValidation,
  authController.verifyPersonalPhone,
);

// POST /api/v1/auth/register-personal
router.post(
  "/register-personal",
  authLimiter,
  [
    body("first_name").trim().notEmpty().withMessage("First name is required"),
    body("last_name").trim().notEmpty().withMessage("Last name is required"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain a number"),
    body("phone_verification_token")
      .isString()
      .isLength({ min: 40, max: 200 })
      .withMessage("Verified phone token is required"),
    body("installation_id")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isUUID()
      .withMessage("Invalid installation identity"),
    body("sim_iccid")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isString()
      .trim()
      .custom((value) => /^\d{10,25}$/.test(String(value).replace(/\s/g, "")))
      .withMessage("Invalid SIM identity"),
  ],
  handleValidation,
  authController.registerPersonal,
);

// POST /api/v1/auth/add-personal-capability (requires auth) - lets an
// existing Business-side user also gain Personal capability without a
// second account.
router.post(
  "/add-personal-capability",
  authenticate,
  [
    body("phone_verification_token")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isString()
      .isLength({
        min: 40,
        max: 200,
      })
      .withMessage("Valid verified phone token is required"),
    body("installation_id")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isUUID()
      .withMessage("Invalid installation identity"),
    body("sim_iccid")
      .optional({
        nullable: true,
        checkFalsy: true,
      })
      .isString()
      .trim()
      .custom((value) => /^\d{10,25}$/.test(String(value).replace(/\s/g, "")))
      .withMessage("Invalid SIM identity"),
  ],
  handleValidation,
  authController.addPersonalCapability,
);

// POST /api/v1/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], handleValidation, authController.login);

// POST /api/v1/auth/mfa/complete
router.post('/mfa/complete', authLimiter, [
  body('challenge_token')
    .isString()
    .isLength({ min: 40, max: 200 })
    .withMessage('Valid MFA challenge is required')
    .custom((value, { req }) => {
      const hasCode =
        typeof req.body.code === 'string' &&
        req.body.code.trim() !== '';

      const hasRecovery =
        typeof req.body.recovery_code === 'string' &&
        req.body.recovery_code.trim() !== '';

      if (hasCode === hasRecovery) {
        throw new Error(
          'Provide exactly one MFA credential'
        );
      }

      return true;
    }),
  body('code')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage(
      'Authenticator code must be exactly 6 digits'
    ),
  body('recovery_code')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 16, max: 32 })
    .withMessage('Invalid recovery code'),
], handleValidation, authController.completeMfa);

// PUT /api/v1/auth/fcm-token
router.put('/fcm-token', authenticate, [
  body('fcm_token')
    .isString()
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Valid FCM token is required'),
], handleValidation, authController.updateFcmToken);

// POST /api/v1/auth/refresh
router.post('/refresh', refreshLimiter, [
  body('refresh_token').notEmpty().withMessage('Refresh token is required'),
], handleValidation, authController.refreshToken);

// POST /api/v1/auth/logout (requires auth)
router.post('/logout', authenticate, [
  body('fcm_token')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Invalid FCM token'),
], handleValidation, authController.logout);

// DELETE /api/v1/auth/account
router.delete(
  '/account',
  authLimiter,
  authenticate,
  [
    body('password')
      .isString()
      .isLength({ min: 1, max: 200 })
      .withMessage(
        'Current password is required'
      ),
  ],
  handleValidation,
  authController.deleteAccount,
);

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
], handleValidation, authController.requestPasswordReset);

// POST /api/v1/auth/reset-password
router.post('/reset-password', authLimiter, [
  body('user_id').isUUID().withMessage('Invalid user ID'),
  body('token').notEmpty().withMessage('Token is required'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
], handleValidation, authController.resetPassword);

// GET /api/v1/auth/me (requires auth)
router.get('/me', authenticate, authController.getMe);

module.exports = router;
