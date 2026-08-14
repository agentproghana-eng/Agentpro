const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const subController = require('../controllers/subscriptionController');
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

router.use(authenticate);

router.get('/status', subController.getSubscription);
router.get('/status/:company_id', authorize('superuser'), subController.getSubscription);

router.post('/payment', [
  body('momo_reference').trim().notEmpty().withMessage('MoMo reference is required'),
  body('payment_phone').trim().notEmpty().withMessage('Payment phone is required'),
], handleValidation, authorize('business_owner'), subController.submitPayment);

router.get('/pending-payments', authorize('superuser'), subController.listPendingPayments);
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
  subController.verifyPayment
);

module.exports = router;
