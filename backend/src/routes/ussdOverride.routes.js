const express = require("express");
const router = express.Router();
const ussdOverrideController = require("../controllers/ussdOverrideController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

// Legacy single-dial pattern overrides are a Business-user feature.
// They override ussd_templates for one authenticated staff member.
//
// Personal automation is Flow Builder-only and deliberately does not
// read agent_ussd_overrides, so accepting Personal writes here would
// create a setting that can never affect execution.
router.use((req, res, next) => {
  if (["agent", "manager", "business_owner"].includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Legacy USSD pattern overrides are only available in Business mode",
  });
});

router.get("/capabilities", ussdOverrideController.listCapabilities);
router.get("/", ussdOverrideController.listOverrides);
router.put("/", ussdOverrideController.saveOverride);
router.delete("/:override_id", ussdOverrideController.deleteOverride);

module.exports = router;
