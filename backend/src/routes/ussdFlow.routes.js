const express = require('express');
const router = express.Router();
const ussdFlowController = require('../controllers/ussdFlowController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// /resolve must be registered before /:id, or Express would treat
// "resolve" as an :id value instead of matching this route.
//
// This endpoint is Business-runtime resolution only:
// Company override -> Global. Personal runtime resolution uses the
// separately protected /personal-ussd-flows/resolve endpoint.
router.get('/resolve', ussdFlowController.resolveFlow);

// Builder metadata is protected by the same role boundary as Business
// Flow Builder CRUD and must be registered before /:id.
router.get(
  '/capabilities',
  authorize('superuser', 'business_owner'),
  ussdFlowController.getCapabilities
);

router.get('/', authorize('superuser', 'business_owner'), ussdFlowController.listFlows);
router.get('/:id', authorize('superuser', 'business_owner'), ussdFlowController.getFlow);
router.post('/', authorize('superuser', 'business_owner'), ussdFlowController.createFlow);
router.patch('/:id', authorize('superuser', 'business_owner'), ussdFlowController.updateFlow);
router.delete('/:id', authorize('superuser', 'business_owner'), ussdFlowController.deleteFlow);

module.exports = router;
