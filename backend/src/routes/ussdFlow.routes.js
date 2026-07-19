const express = require('express');
const router = express.Router();
const ussdFlowController = require('../controllers/ussdFlowController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', authorize('superuser', 'business_owner'), ussdFlowController.listFlows);
router.get('/:id', authorize('superuser', 'business_owner'), ussdFlowController.getFlow);
router.post('/', authorize('superuser', 'business_owner'), ussdFlowController.createFlow);
router.patch('/:id', authorize('superuser', 'business_owner'), ussdFlowController.updateFlow);
router.delete('/:id', authorize('superuser', 'business_owner'), ussdFlowController.deleteFlow);

module.exports = router;
