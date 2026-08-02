const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const personalTransactionController = require('../controllers/personalTransactionController');
const { authenticate, requirePersonalAccount } = require('../middleware/auth');

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

// POST /api/v1/personal-transactions — Initiate a transaction
router.post('/', [
  body('provider').isIn(['mtn', 'telecel', 'at_money']).withMessage('Invalid provider'),
  body('transaction_type').isIn([
    'send_money_same_network', 'send_money_cross_network',
    'buy_airtime', 'buy_data', 'buy_mashup',
    'check_momo_balance', 'check_airtime_balance', 'withdraw_cash'
  ]).withMessage('Invalid transaction type'),
], handleValidation, personalTransactionController.initiateTransaction);

// PATCH /api/v1/personal-transactions/:transaction_id/complete
router.patch('/:transaction_id/complete', [
  body('status').isIn(['success', 'failed', 'pending_confirmation']).withMessage('Invalid status'),
], handleValidation, personalTransactionController.completeTransaction);

// GET /api/v1/personal-transactions — List the current user's own history
router.get('/', personalTransactionController.listTransactions);

// GET /api/v1/personal-transactions/:transaction_id
router.get('/:transaction_id', personalTransactionController.getTransaction);

module.exports = router;
