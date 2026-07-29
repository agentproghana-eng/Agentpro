const express = require('express');
const router = express.Router();
const personalReportController = require('../controllers/personalReportController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Reports are Paid-Personal-only per spec, unlike transactions
// themselves (baseline requirePersonalAccount) or Community viewing/
// reacting (also baseline).
router.use(authenticate, requirePersonalAccount, requirePaidPersonalPlan);

router.get('/transactions', personalReportController.transactionReport);

module.exports = router;
