// user.routes.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const userRouter = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }
  next();
};

const userIdValidation = [
  param('user_id').isUUID().withMessage('Invalid user ID'),
];

const createUserValidation = [
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required'),
  body('role')
    .isIn(['business_owner', 'manager', 'agent', 'auditor', 'customer'])
    .withMessage('Invalid user role'),
  body('branch_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID()
    .withMessage('Invalid branch ID'),
  body('password')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
];

const updateUserValidation = [
  ...userIdValidation,
  body('first_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty'),
  body('last_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty'),
  body('phone')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Phone number cannot be empty'),
  body('status')
    .optional()
    .isIn(['pending', 'active', 'suspended', 'deactivated'])
    .withMessage('Invalid account status'),
];

const reassignBranchValidation = [
  ...userIdValidation,
  body('branch_id')
    .notEmpty()
    .withMessage('branch_id is required')
    .bail()
    .isUUID()
    .withMessage('Invalid branch ID'),
];

userRouter.use(authenticate);

userRouter.get(
  '/',
  authorize('superuser', 'business_owner', 'manager'),
  userController.listUsers
);

userRouter.post(
  '/',
  authorize('superuser', 'business_owner', 'manager'),
  createUserValidation,
  handleValidation,
  userController.createUser
);

userRouter.patch('/me/password', userController.changePassword);
userRouter.patch('/me/settings', userController.updateMySettings);
userRouter.get('/me/quick-actions/catalog', userController.getMyQuickActionCatalog);
userRouter.get('/me/quick-actions', userController.getMyQuickActions);
userRouter.patch('/me/quick-actions', userController.updateMyQuickActions);
userRouter.get('/me/feature-flags', userController.getFeatureFlags);

userRouter.get(
  '/:user_id',
  authorize('superuser', 'business_owner', 'manager'),
  userIdValidation,
  handleValidation,
  userController.getUser
);

userRouter.patch(
  '/:user_id',
  authorize('superuser', 'business_owner'),
  updateUserValidation,
  handleValidation,
  userController.updateUser
);

userRouter.patch(
  '/:user_id/reassign-branch',
  authorize('superuser', 'business_owner'),
  reassignBranchValidation,
  handleValidation,
  userController.reassignBranch
);

module.exports = userRouter;
