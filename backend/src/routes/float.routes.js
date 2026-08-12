// float.routes.js
const express = require('express');
const router = express.Router();
const floatController = require('../controllers/floatController');
const { authenticate, authorize, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/overview', authorize('superuser', 'business_owner', 'manager', 'auditor'), floatController.getFloatOverview);
router.get('/branch/:branch_id', authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'), floatController.getBranchFloat);
router.get('/history', authorize('superuser', 'business_owner', 'manager', 'auditor'), floatController.getFloatHistory);
router.post('/top-up', authorize('superuser', 'business_owner', 'manager'), floatController.topUpFloat);
router.patch('/threshold', authorize('superuser', 'business_owner', 'manager'), floatController.updateThreshold);
router.get('/requests', authorize('business_owner', 'manager', 'agent'), floatController.listFloatRequests);
router.post('/request', authorize('agent'), floatController.submitFloatRequest);
router.patch('/request/:request_id/review', authorize('manager', 'business_owner'), floatController.reviewFloatRequest);

module.exports = router;
