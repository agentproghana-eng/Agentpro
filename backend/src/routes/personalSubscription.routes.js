const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const personalSubController = require('../controllers/personalSubscriptionController');
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

router.get('/pending-payments', authorize('superuser'), personalSubController.listPendingPayments);
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
