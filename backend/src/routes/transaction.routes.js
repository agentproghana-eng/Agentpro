const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const transactionController = require('../controllers/transactionController');
const { authenticate, authorize, requireActiveSubscription } = require('../middleware/auth');

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

// All transaction routes require authentication and active subscription
router.use(authenticate);
router.use(requireActiveSubscription);

// POST /api/v1/transactions — Initiate a transaction
router.post('/', [
  body('provider').isIn(['mtn', 'telecel', 'at_money']).withMessage('Invalid provider'),
  body('transaction_type').isIn([
    'cash_in', 'cash_out', 'send_money', 'merchant_payment',
    'bill_payment', 'airtime', 'data_bundle', 'balance_enquiry',
    'mini_statement', 'reversal'
  ]).withMessage('Invalid transaction type'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
],
  handleValidation,
  authorize('agent', 'business_owner', 'manager'),
  transactionController.initiateTransaction
);

// PATCH /api/v1/transactions/:transaction_id/complete — Mark success, failure, or unconfirmed
router.patch('/:transaction_id/complete', [
  body('status').isIn(['success', 'failed', 'pending_confirmation'])
    .withMessage('Status must be success, failed, or pending_confirmation'),
],
  handleValidation,
  authorize('agent', 'business_owner', 'manager'),
  transactionController.completeTransaction
);

// GET /api/v1/transactions — List transactions
router.get('/',
  authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'),
  transactionController.listTransactions
);

// GET /api/v1/transactions/:transaction_id — Get single transaction
router.get('/:transaction_id',
  authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'),
  transactionController.getTransaction
);

module.exports = router;
