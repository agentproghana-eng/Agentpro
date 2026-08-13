const express = require('express');
const {
  body,
  param,
  query,
  validationResult,
} = require('express-validator');
const router = express.Router();
const branchController = require('../controllers/branchController');
const {
  authenticate,
  authorize,
  requireActiveSubscription,
} = require('../middleware/auth');

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

const branchIdValidation = [
  param('branch_id')
    .isUUID()
    .withMessage('Invalid branch ID'),
];

const listBranchesValidation = [
  query('company_id')
    .optional({ checkFalsy: true })
    .if((value, { req }) => req.user?.role === 'superuser')
    .isUUID()
    .withMessage('Invalid company ID'),
];

const createBranchValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Branch name is required')
    .bail()
    .isLength({ max: 255 })
    .withMessage('Branch name must be at most 255 characters'),

  body('location')
    .optional({ nullable: true })
    .trim(),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number must be at most 20 characters'),

  body('company_id')
    .if((value, { req }) => req.user?.role === 'superuser')
    .notEmpty()
    .withMessage('company_id is required for superuser branch creation')
    .bail()
    .isUUID()
    .withMessage('Invalid company ID'),
];

const updateBranchValidation = [
  ...branchIdValidation,

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Branch name cannot be empty')
    .bail()
    .isLength({ max: 255 })
    .withMessage('Branch name must be at most 255 characters'),

  body('location')
    .optional({ nullable: true })
    .trim(),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number must be at most 20 characters'),

  body('status')
    .optional()
    .isIn(['pending', 'active', 'suspended', 'deactivated'])
    .withMessage('Invalid branch status'),
];

router.use(authenticate, requireActiveSubscription);

router.get(
  '/',
  authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'),
  listBranchesValidation,
  handleValidation,
  branchController.listBranches
);

router.post(
  '/',
  authorize('superuser', 'business_owner'),
  createBranchValidation,
  handleValidation,
  branchController.createBranch
);

router.get(
  '/:branch_id',
  authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'),
  branchIdValidation,
  handleValidation,
  branchController.getBranch
);

router.patch(
  '/:branch_id',
  authorize('superuser', 'business_owner'),
  updateBranchValidation,
  handleValidation,
  branchController.updateBranch
);

module.exports = router;
