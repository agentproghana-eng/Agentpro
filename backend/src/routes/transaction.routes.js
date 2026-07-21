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
    'commission_balance', 'cash_in_commission', 'commission_transfer',
    'bill_payment', 'airtime', 'data_bundle', 'balance_enquiry',
    'mini_statement', 'reversal'
  ]).withMessage('Invalid transaction type'),
  body('amount').custom((value, { req }) => {
    // These four transaction types dial and get PIN-prompted with no
    // amount ever entered by the agent, so the app never fills in
    // this field - it stays at its default zero. The old flat
    // isFloat({min: 0.01}) check rejected every one of them outright.
    const noAmountTypes = ['balance_enquiry', 'mini_statement', 'commission_balance', 'cash_in_commission'];
    if (noAmountTypes.includes(req.body.transaction_type)) return true;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0.01) throw new Error('Amount must be a positive number');
    return true;
  }),
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
