const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { authenticate, authorize, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);
router.get('/', authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'), branchController.listBranches);
router.post('/', authorize('superuser', 'business_owner'), branchController.createBranch);
router.get('/:branch_id', authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'), branchController.getBranch);
router.patch('/:branch_id', authorize('superuser', 'business_owner'), branchController.updateBranch);

module.exports = router;
