const express = require('express');
const router = express.Router();
const personalUssdFlowController = require('../controllers/personalUssdFlowController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Every route requires an active Paid Personal subscription - Custom
// USSD Flows are a Paid-only feature per spec, unlike viewing/reacting
// in the Community which Free Personal users get too.
router.use(authenticate, requirePersonalAccount, requirePaidPersonalPlan);

// Runtime resolution must be registered before /:id so Express does not
// interpret "resolve" as a flow UUID. This route inherits the Personal
// capability + Paid subscription middleware above.
router.get('/resolve', personalUssdFlowController.resolveFlow);

// Inherits authenticate + Personal capability + Paid-plan middleware.
// Register before /:id so "capabilities" is never interpreted as a UUID.
router.get('/capabilities', personalUssdFlowController.getCapabilities);

router.get('/', personalUssdFlowController.listFlows);
router.get('/:id', personalUssdFlowController.getFlow);
router.post('/', personalUssdFlowController.createFlow);
router.patch('/:id', personalUssdFlowController.updateFlow);
router.delete('/:id', personalUssdFlowController.deleteFlow);

module.exports = router;
