// shift.routes.js
const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const {
  authenticate,
  authorize,
  requireActiveSubscription,
} = require('../middleware/auth');
const {
  hasAdminRole,
  isAdminPortalRole,
} = require('../security/adminRbac');

router.use(authenticate);

const requireShiftListAccess = (
  req,
  res,
  next,
) => {
  if (req.user.role === 'superuser') {
    return next();
  }

  if (
    hasAdminRole(
      req.user,
      'admin_operations',
    )
  ) {
    if (
      !isAdminPortalRole(
        req.user.role,
      ) &&
      !req.user.mfa_verified_at
    ) {
      return res.status(401).json({
        success: false,
        code: 'MFA_REAUTH_REQUIRED',
        message:
          'Administrator MFA authentication is required. Please sign in again.',
      });
    }

    return next();
  }

  if (
    [
      'business_owner',
      'manager',
      'auditor',
    ].includes(
      req.user.role,
    )
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message:
      'You do not have permission to access this resource',
  });
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
