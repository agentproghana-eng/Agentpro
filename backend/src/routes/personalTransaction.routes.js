const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const personalTransactionController = require('../controllers/personalTransactionController');
const { authenticate, requirePersonalAccount } = require('../middleware/auth');
const {
  createInitiationCapabilityGuard,
} = require('../middleware/transactionCapability');

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

// Every route here requires both a valid login AND Personal capability
// enabled on that account (requirePersonalAccount) - a pure Business
// user with no personal_subscriptions row gets a clear 403, not a
// confusing empty result.
router.use(authenticate, requirePersonalAccount);

const personalInitiationCapabilityGuard =
  createInitiationCapabilityGuard('personal');

// POST /api/v1/personal-transactions — Initiate a transaction
router.post('/', [
  body('provider')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Invalid provider'),
  body('transaction_type')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Invalid transaction type'),
],
  handleValidation,
  personalInitiationCapabilityGuard,
  personalTransactionController.initiateTransaction
);

// PATCH /api/v1/personal-transactions/:transaction_id/complete
router.patch('/:transaction_id/complete', [
  body('status').isIn(['success', 'failed', 'pending_confirmation']).withMessage('Invalid status'),
], handleValidation, personalTransactionController.completeTransaction);

// GET /api/v1/personal-transactions — List the current user's own history
router.get('/', personalTransactionController.listTransactions);

// GET /api/v1/personal-transactions/:transaction_id
router.get('/:transaction_id', personalTransactionController.getTransaction);

module.exports = router;
