const express = require('express');
const router = express.Router();
const ussdFlowController = require('../controllers/ussdFlowController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// /resolve must be registered before /:id, or Express would treat
// "resolve" as an :id value instead of matching this route. Open to
// any authenticated role (agent, manager, owner, superuser) - unlike
// the builder CRUD below, this is what an agent's device calls at
// transaction time to find out how to automate a USSD dial for a
// provider/type not already hardcoded (MTN/Telecel).
router.get('/resolve', ussdFlowController.resolveFlow);

router.get('/', authorize('superuser', 'business_owner'), ussdFlowController.listFlows);
router.get('/:id', authorize('superuser', 'business_owner'), ussdFlowController.getFlow);
router.post('/', authorize('superuser', 'business_owner'), ussdFlowController.createFlow);
router.patch('/:id', authorize('superuser', 'business_owner'), ussdFlowController.updateFlow);
router.delete('/:id', authorize('superuser', 'business_owner'), ussdFlowController.deleteFlow);

module.exports = router;
