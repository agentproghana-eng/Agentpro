// shift.routes.js
const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { authenticate, authorize, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Any role that can actually process a transaction (see
// transaction.routes.js - no role restriction there at all) can
// accumulate cash_at_hand and needs to be able to reconcile it,
// including a solo business owner who hasn't hired any agents yet.
router.post('/open', authorize('agent', 'business_owner', 'manager'), shiftController.openShift);
router.get('/current', authorize('agent', 'business_owner', 'manager'), shiftController.getCurrentShift);
router.post('/:shift_id/close', authorize('agent', 'business_owner', 'manager'), shiftController.closeShift);
router.get('/', authorize('superuser', 'business_owner', 'manager'), shiftController.listShifts);

module.exports = router;
