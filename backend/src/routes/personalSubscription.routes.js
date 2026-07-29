const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const personalSubController = require('../controllers/personalSubscriptionController');
const { authenticate, authorize, requirePersonalAccount } = require('../middleware/auth');

router.use(authenticate);

router.get('/status', requirePersonalAccount, personalSubController.getSubscription);

router.post('/payment', requirePersonalAccount, [
  body('momo_reference').trim().notEmpty().withMessage('MoMo reference is required'),
  body('payment_phone').trim().notEmpty().withMessage('Payment phone is required'),
], personalSubController.submitPayment);

router.get('/pending-payments', authorize('superuser'), personalSubController.listPendingPayments);
router.patch('/payment/:payment_id/verify', authorize('superuser'), personalSubController.verifyPayment);

module.exports = router;
