const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const personalSubController = require('../controllers/personalSubscriptionController');
const paystackSubscriptionController = require('../controllers/paystackSubscriptionController');
const { authenticate, authorize, requirePersonalAccount } = require('../middleware/auth');

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

router.use(authenticate);

router.get('/status', requirePersonalAccount, personalSubController.getSubscription);

router.post('/payment', requirePersonalAccount, [
  body('momo_reference').trim().notEmpty().withMessage('MoMo reference is required'),
  body('payment_phone').trim().notEmpty().withMessage('Payment phone is required'),
], handleValidation, personalSubController.submitPayment);


router.post(
  '/paystack/initialize',
  requirePersonalAccount,
  paystackSubscriptionController.initializePersonal
);

router.get(
  '/paystack/verify/:reference',
  requirePersonalAccount,
  [
    param('reference')
      .trim()
      .matches(/^[A-Za-z0-9.=-]+$/)
      .withMessage('Invalid Paystack reference'),
  ],
  handleValidation,
  paystackSubscriptionController.verifyPersonal
);

router.get('/pending-payments', authorize('superuser'), personalSubController.listPendingPayments);
router.get(
  '/reconciliation-payments',
  authorize('superuser'),
  personalSubController.listReconciliationPayments
);

router.patch(
  '/payment/:payment_id/verify',
  authorize('superuser'),
  [
    param('payment_id')
      .isUUID()
      .withMessage('Invalid payment ID'),
    body('action')
      .isIn(['approve', 'reject'])
      .withMessage('Action must be approve or reject'),
  ],
  handleValidation,
  personalSubController.verifyPayment
);

module.exports = router;
