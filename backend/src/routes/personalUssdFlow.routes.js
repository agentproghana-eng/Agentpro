const express = require('express');
const router = express.Router();
const personalUssdFlowController = require('../controllers/personalUssdFlowController');
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require('../middleware/auth');

// Every route requires an active Paid Personal subscription - Custom
// USSD Flows are a Paid-only feature per spec, unlike viewing/reacting
// in the Community which Free Personal users get too.
router.use(authenticate, requirePersonalAccount, requirePaidPersonalPlan);

router.get('/', personalUssdFlowController.listFlows);
router.get('/:id', personalUssdFlowController.getFlow);
router.post('/', personalUssdFlowController.createFlow);
router.patch('/:id', personalUssdFlowController.updateFlow);
router.delete('/:id', personalUssdFlowController.deleteFlow);

module.exports = router;
