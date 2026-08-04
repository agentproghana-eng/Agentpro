// ============================================================
// report.routes.js
// ============================================================
const express = require('express');
const reportRouter = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize, requireActiveSubscription } = require('../middleware/auth');

reportRouter.use(authenticate, requireActiveSubscription);
reportRouter.get('/dashboard', reportController.dashboardSummary);
reportRouter.get(
  '/transactions/count',
  authorize('superuser','business_owner','manager','agent','auditor'),
  reportController.transactionCount
);
reportRouter.get('/transactions', authorize('superuser','business_owner','manager','agent','auditor'), reportController.transactionReport);
reportRouter.get('/commissions', authorize('superuser','business_owner','manager','auditor'), reportController.commissionReport);

module.exports = reportRouter;
