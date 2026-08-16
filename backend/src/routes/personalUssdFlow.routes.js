const express = require('express');
const router = express.Router();
const personalUssdFlowController = require('../controllers/personalUssdFlowController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Every route requires Personal capability.
router.use(authenticate, requirePersonalAccount);

// Runtime execution of centrally managed Global flows is available to
// both Free and Paid Personal accounts. The controller itself only
// considers a Personal-owned override when the attached subscription
// is actively Paid.
router.get('/resolve', personalUssdFlowController.resolveFlow);

// Everything below this point is Personal Flow Builder functionality,
// which remains Paid-only.
router.use(requirePaidPersonalPlan);

// Register before /:id so "capabilities" is never interpreted as a UUID.
router.get('/capabilities', personalUssdFlowController.getCapabilities);

router.get('/', personalUssdFlowController.listFlows);
router.get('/:id', personalUssdFlowController.getFlow);
router.post('/', personalUssdFlowController.createFlow);
router.patch('/:id', personalUssdFlowController.updateFlow);
router.delete('/:id', personalUssdFlowController.deleteFlow);

module.exports = router;
