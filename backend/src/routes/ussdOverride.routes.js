const express = require("express");
const router = express.Router();
const ussdOverrideController = require("../controllers/ussdOverrideController");
const { authenticate, requirePersonalAccount, requirePaidPersonalPlan } = require("../middleware/auth");

router.use(authenticate);

// Agents get this by default (their existing access, unchanged) - the
// underlying storage (agent_ussd_overrides) is already scoped purely
// by user_id with no company/branch dependency, so a Personal
// subscriber can use it exactly the same way once gated correctly. A
// Personal subscriber only gets it on the Paid plan - Free Personal
// users don't have USSD Automation access per spec. Composed from the
// existing requirePersonalAccount/requirePaidPersonalPlan middlewares
// rather than duplicating their logic.
router.use((req, res, next) => {
  if (req.user.role === "agent") return next();
  if (req.user.role !== "customer") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  requirePersonalAccount(req, res, () => requirePaidPersonalPlan(req, res, next));
});

router.get("/", ussdOverrideController.listOverrides);
router.put("/", ussdOverrideController.saveOverride);
router.delete("/:override_id", ussdOverrideController.deleteOverride);

module.exports = router;
