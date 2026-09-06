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

const PERSONAL_CROSS_NETWORK_SELECTIONS = new Map([
  ['mtn', new Set(['1', '2', '3', '4', '5', '6'])],
  ['telecel', new Set(['1', '2', '3', '4'])],
]);

const TELECEL_PERSONAL_BANK_SELECTIONS = new Map([
  ['access bank', ['1', '1']],
  ['adb', ['1', '2']],
  ['advans ghana s&l', ['1', '3']],
  ['absa', ['1', '4']],
  ['bank of africa', ['1', '5']],
  ['cal bank', ['1', '6']],
  ['cbg', ['1', '7']],
  ['arb apex bank', ['1', '8']],
  ['affinity', ['1', '9']],
  ['adehyeman s&l', ['1', '10']],
  ['best point', ['1', '11']],
  ['ecobank', ['2', '1']],
  ['fidelity', ['2', '2']],
  ['first atlantic bank', ['2', '3']],
  ['first national bank', ['2', '4']],
  ['firstbank ghana', ['2', '8']],
  ['gcb bank', ['3', '1']],
  ['gt bank', ['3', '2']],
  ['nib', ['3', '3']],
  ['prudential', ['3', '4']],
  ['republic', ['3', '5']],
  ['omnibsic', ['3', '6']],
  ['ghl bank', ['3', '7']],
  ['opportunity international s&l', ['3', '8']],
  ['letshego', ['3', '9']],
  ['it consortium', ['3', '10']],
  ['stanchart', ['4', '1']],
  ['stanbic', ['4', '2']],
  ['uba', ['4', '3']],
  ['umb', ['4', '4']],
  ['zenith', ['4', '5']],
  ['services integrity savings & loans', ['4', '6']],
  ['sg-gh', ['4', '7']],
  ['sinapi aba savings and loans', ['4', '8']],
]);

const isTelecelBankTransfer = (payload) =>
  payload?.provider === 'telecel' &&
  payload?.transaction_type === 'send_money_to_bank';

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

  body('bank_name')
    .optional({ nullable: true })
    .isString()
    .withMessage('bank_name must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('bank_name is invalid'),

  body('account_number')
    .optional({ nullable: true })
    .isString()
    .withMessage('account_number must be a string')
    .trim()
    .matches(/^\d{6,20}$/)
    .withMessage('Account number must contain 6 to 20 digits'),

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

  body('bank_name').custom(
    requireNonBlankWhen(
      isTelecelBankTransfer,
      'Bank name is required for Send Money to Bank',
    ),
  ),

  body('account_number').custom(
    requireNonBlankWhen(
      isTelecelBankTransfer,
      'Account number is required for Send Money to Bank',
    ),
  ),

  body('notes').custom(
    requireNonBlankWhen(
      (payload) =>
        (
          payload?.provider === 'mtn' &&
          PERSONAL_SEND_MONEY_TYPES.has(
            payload?.transaction_type,
          )
        ) ||
        (
          payload?.provider === 'telecel' &&
          (
            PERSONAL_SEND_MONEY_TYPES.has(
              payload?.transaction_type,
            ) ||
            payload?.transaction_type === 'send_money_to_bank'
          )
        ),
      'Reference is required for this Send Money transaction',
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
    const provider =
      normalizedString(req.body.provider).toLowerCase();

    if (isTelecelBankTransfer(req.body)) {
      const bankName =
        normalizedString(req.body.bank_name).toLowerCase();

      const expectedSelections =
        TELECEL_PERSONAL_BANK_SELECTIONS.get(bankName);

      if (!expectedSelections) {
        throw new Error(
          'Bank name is not supported for Telecel Send Money to Bank',
        );
      }

      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(
          'Bank routing selections are required for Telecel Send Money to Bank',
        );
      }

      const actualSelections =
        value.map(normalizedString);

      if (
        actualSelections[0] !== expectedSelections[0] ||
        actualSelections[1] !== expectedSelections[1]
      ) {
        throw new Error(
          'Bank routing selections do not match the selected Telecel bank',
        );
      }

      return true;
    }

    const allowedSelections =
      PERSONAL_CROSS_NETWORK_SELECTIONS.get(provider);

    if (
      req.body.transaction_type ===
        'send_money_cross_network' &&
      allowedSelections
    ) {
      if (!Array.isArray(value) || value.length !== 1) {
        throw new Error(
          `Recipient network selection is required for ${provider} cross-network Send Money`,
        );
      }

      const selection = normalizedString(value[0]);

      if (!allowedSelections.has(selection)) {
        throw new Error(
          `Recipient network selection is invalid for ${provider} cross-network Send Money`,
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
