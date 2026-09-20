// shift.routes.js
const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const {
  authenticate,
  authorize,
  requireActiveSubscription,
} = require('../middleware/auth');

router.use(authenticate);

const requireShiftListAccess = (
  req,
  res,
  next,
) => {
  if (
    [
      'superuser',
      'admin_operations',
    ].includes(req.user.role)
  ) {
    return next();
  }

  return requireActiveSubscription(
    req,
    res,
    () =>
      authorize(
        'business_owner',
        'manager',
      )(req, res, next),
  );
};

router.get(
  '/cursor',
  requireShiftListAccess,
  shiftController.listShiftsCursor,
);

router.get(
  '/',
  requireShiftListAccess,
  shiftController.listShifts,
);

// Transaction-processing shift actions keep the existing business
// subscription boundary. Admin staff never receive these permissions.
router.use(requireActiveSubscription);

router.post(
  '/open',
  authorize(
    'agent',
    'business_owner',
    'manager',
  ),
  shiftController.openShift,
);

router.get(
  '/current',
  authorize(
    'agent',
    'business_owner',
    'manager',
  ),
  shiftController.getCurrentShift,
);

router.post(
  '/:shift_id/close',
  authorize(
    'agent',
    'business_owner',
    'manager',
  ),
  shiftController.closeShift,
);

module.exports = router;
