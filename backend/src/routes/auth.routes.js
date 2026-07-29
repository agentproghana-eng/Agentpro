const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

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

// POST /api/v1/auth/register-personal
router.post('/register-personal', authLimiter, [
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
], handleValidation, authController.registerPersonal);

// POST /api/v1/auth/add-personal-capability (requires auth) - lets an
// existing Business-side user also gain Personal capability without a
// second account.
router.post('/add-personal-capability', authenticate, authController.addPersonalCapability);

// POST /api/v1/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], handleValidation, authController.login);

// POST /api/v1/auth/refresh
router.post('/refresh', [
  body('refresh_token').notEmpty().withMessage('Refresh token is required'),
], handleValidation, authController.refreshToken);

// POST /api/v1/auth/logout (requires auth)
router.post('/logout', authenticate, authController.logout);

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
