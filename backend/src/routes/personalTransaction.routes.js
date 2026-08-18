const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const personalTransactionController = require('../controllers/personalTransactionController');
const {
  authenticate,
  requirePersonalAccount,
  requirePaidPersonalPlan,
} = require('../middleware/auth');
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

const NO_AMOUNT_PERSONAL_TYPES = new Set([
  'check_momo_balance',
  'check_airtime_balance',
]);

const PERSONAL_SEND_MONEY_TYPES = new Set([
  'send_money_same_network',
  'send_money_cross_network',
]);

const normalizedString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const finiteNumber = (value) => {
  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim().length === 0
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const requireNonBlankWhen =
  (shouldRequire, message) =>
    (value, { req }) => {
      if (!shouldRequire(req.body)) {
        return true;
      }

      if (normalizedString(value).length === 0) {
        throw new Error(message);
      }

      return true;
    };

const requiresRecipientMode = (payload) => {
  const type = payload?.transaction_type;

  if (type === 'buy_data' || type === 'buy_mashup') {
    return true;
  }

  return (
    type === 'buy_airtime' &&
    payload?.provider === 'mtn'
  );
};

const requiresRecipientPhone = (payload) => {
  const type = payload?.transaction_type;

  if (PERSONAL_SEND_MONEY_TYPES.has(type)) {
    return true;
  }

  if (
    type === 'buy_data' ||
    type === 'buy_mashup'
  ) {
    return payload?.recipient_mode === 'other';
  }

  if (type === 'buy_airtime') {
    if (payload?.provider === 'mtn') {
      return payload?.recipient_mode === 'other';
    }

    // Current non-MTN generic Personal Airtime form has a recipient
    // phone field rather than MTN's Self/Other selector.
    return true;
  }

  return false;
};

// POST /api/v1/personal-transactions — Initiate a transaction
router.post('/', [
  body('provider')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Invalid provider'),
  body('client_operation_id')
    .isUUID()
    .withMessage('client_operation_id must be a valid UUID'),
  body('installation_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID()
    .withMessage('installation_id must be a valid UUID'),
  body('sim_subscription_id')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('sim_subscription_id must be a non-negative integer')
    .toInt(),
  body('selections_in_order')
    .optional({ nullable: true })
    .isArray({ max: 16 })
    .withMessage('selections_in_order must be an array'),
  body('selections_in_order.*')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage('Each USSD selection must be a short string'),
  body('transaction_type')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Invalid transaction type'),

  body('recipient_phone')
    .optional({ nullable: true })
    .isString()
    .withMessage('recipient_phone must be a string')
    .trim(),

  body('merchant_id')
    .optional({ nullable: true })
    .isString()
    .withMessage('merchant_id must be a string')
    .trim(),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('notes must be a string')
    .trim(),

  body('bundle_category')
    .optional({ nullable: true })
    .isString()
    .withMessage('bundle_category must be a string')
    .trim(),

  body('recipient_mode')
    .optional({ nullable: true })
    .isIn(['self', 'other'])
    .withMessage('recipient_mode must be self or other'),

  body('recipient_mode').custom(
    requireNonBlankWhen(
      requiresRecipientMode,
      'Recipient mode is required for this transaction type',
    ),
  ),

  body('recipient_phone').custom(
    requireNonBlankWhen(
      requiresRecipientPhone,
      'Recipient phone number is required for this transaction type',
    ),
  ),

  body('notes').custom(
    requireNonBlankWhen(
      (payload) =>
        payload?.provider === 'mtn' &&
        PERSONAL_SEND_MONEY_TYPES.has(
          payload?.transaction_type,
        ),
      'Reference is required for MTN Send Money',
    ),
  ),

  body('merchant_id').custom(
    requireNonBlankWhen(
      (payload) =>
        payload?.transaction_type === 'withdraw_cash',
      'Till number is required for Withdraw Cash',
    ),
  ),

  body('bundle_category').custom(
    requireNonBlankWhen(
      (payload) =>
        payload?.transaction_type === 'buy_data' ||
        payload?.transaction_type === 'buy_mashup',
      'Bundle category is required for this transaction type',
    ),
  ),

  body('selections_in_order').custom((value, { req }) => {
    if (
      req.body.provider === 'mtn' &&
      req.body.transaction_type ===
        'send_money_cross_network'
    ) {
      if (!Array.isArray(value) || value.length !== 1) {
        throw new Error(
          'Recipient network selection is required for MTN cross-network Send Money',
        );
      }
    }

    return true;
  }),

  body('amount').custom((value, { req }) => {
    const type = req.body.transaction_type;

    if (NO_AMOUNT_PERSONAL_TYPES.has(type)) {
      if (
        value === undefined ||
        value === null ||
        (
          typeof value === 'string' &&
          value.trim().length === 0
        )
      ) {
        return true;
      }

      const amount = finiteNumber(value);

      if (amount === 0) {
        return true;
      }

      throw new Error(
        'Amount must be zero or omitted for this transaction type',
      );
    }

    if (type === 'buy_data') {
      const category = normalizedString(
        req.body.bundle_category,
      ).toLowerCase();

      const isFlexi =
        category === 'flexi' ||
        category.startsWith('flexi_');

      if (isFlexi) {
        const amount = finiteNumber(value);

        if (amount === null || amount <= 0) {
          throw new Error(
            'Flexi Data amount must be a positive number',
          );
        }

        return true;
      }

      // Current fixed Personal bundle flows encode the purchased
      // bundle through provider menu selections, not a caller-supplied
      // monetary amount. Reject an injected amount so the stored
      // transaction cannot disagree with what the provider menu buys.
      if (
        value === undefined ||
        value === null ||
        (
          typeof value === 'string' &&
          value.trim().length === 0
        )
      ) {
        return true;
      }

      throw new Error(
        'Amount must be omitted for fixed Data Bundles',
      );
    }

    const amount = finiteNumber(value);

    if (amount === null || amount <= 0) {
      throw new Error(
        'Amount must be a positive number',
      );
    }

    return true;
  }),
],
  handleValidation,
  personalInitiationCapabilityGuard,
  personalTransactionController.initiateTransaction
);

// PATCH /api/v1/personal-transactions/:transaction_id/complete
router.patch('/:transaction_id/complete', [
  body('status').isIn(['success', 'failed', 'pending_confirmation']).withMessage('Invalid status'),
], handleValidation, personalTransactionController.completeTransaction);

// GET /api/v1/personal-transactions — Bounded recent activity preview
router.get('/', personalTransactionController.listRecentTransactions);

// GET /api/v1/personal-transactions/history — Paid-only complete history
router.get(
  '/history',
  requirePaidPersonalPlan,
  personalTransactionController.listTransactions
);

// GET /api/v1/personal-transactions/:transaction_id
router.get('/:transaction_id', personalTransactionController.getTransaction);

module.exports = router;
