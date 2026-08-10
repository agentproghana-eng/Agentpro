const express = require("express");
const {
  body,
  query: queryParam,
  validationResult
} = require("express-validator");
const router = express.Router();
const balanceController = require("../controllers/balanceController");
const { authenticate, authorize } = require("../middleware/auth");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg
      }))
    });
  }

  next();
};

router.use(authenticate);
router.get("/pending-adjustments", authorize("superuser", "business_owner", "manager"), balanceController.listPendingAdjustments);

router.get(
  "/cash-drawer",
  authorize("agent"),
  balanceController.getOwnCashBalance
);

router.get(
  "/sim-wallet",
  [
    queryParam("provider")
      .isIn(["mtn", "telecel", "at_money"])
      .withMessage("Invalid provider"),

    queryParam("sim_iccid")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .isLength({ max: 100 })
      .withMessage("sim_iccid is invalid"),

    queryParam("sim_slot")
      .isInt({ min: 0 })
      .withMessage(
        "sim_slot must be a non-negative integer"
      )
      .toInt(),

    queryParam("installation_id")
      .optional({
        nullable: true,
        checkFalsy: true
      })
      .isUUID()
      .withMessage(
        "installation_id must be a valid UUID"
      ),

    queryParam("sim_subscription_id")
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage(
        "sim_subscription_id must be a non-negative integer"
      )
      .toInt()
  ],
  handleValidation,
  authorize("agent"),
  balanceController.getOwnSimWalletBalance
);

router.post(
  "/cash-out-manual",
  [
    body("provider")
      .isIn(["telecel", "at_money"])
      .withMessage("Manual Cash Out is only supported for Telecel or AT Money"),
    body("amount")
      .isFloat({ gt: 0 })
      .withMessage("Amount must be a positive number"),
    body("client_operation_id")
      .isUUID()
      .withMessage("client_operation_id must be a valid UUID"),
    body("sim_slot")
      .isInt({ min: 0 })
      .withMessage("sim_slot must be a valid SIM slot"),
    body("sim_iccid")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 100 })
      .withMessage("sim_iccid is invalid"),
    body("installation_id")
      .optional({ nullable: true, checkFalsy: true })
      .isUUID()
      .withMessage("installation_id must be a valid UUID"),
    body("sim_subscription_id")
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage("sim_subscription_id must be a non-negative integer")
      .toInt(),
    body("reference")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 255 })
      .withMessage("reference is too long"),
    body("notes")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 1000 })
      .withMessage("notes is too long")
  ],
  handleValidation,
  authorize("agent", "business_owner", "manager"),
  balanceController.recordCashOutManual
);
router.post(
  "/float-received",
  [
    body("provider")
      .isIn(["mtn", "telecel", "at_money"])
      .withMessage("Invalid provider"),

    body("amount")
      .isFloat({ min: 0.01 })
      .withMessage("Amount must be a positive number")
      .toFloat(),

    body("client_operation_id")
      .isUUID()
      .withMessage("client_operation_id must be a valid UUID"),

    body("sim_iccid")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 100 })
      .withMessage("sim_iccid is invalid"),

    body("sim_slot")
      .isInt({ min: 0 })
      .withMessage("sim_slot must be a non-negative integer")
      .toInt(),

    body("installation_id")
      .optional({ nullable: true, checkFalsy: true })
      .isUUID()
      .withMessage("installation_id must be a valid UUID"),

    body("sim_subscription_id")
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage(
        "sim_subscription_id must be a non-negative integer"
      )
      .toInt(),

    body("reference")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 100 })
      .withMessage("reference is too long"),

    body("notes")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 1000 })
      .withMessage("notes is too long")
  ],
  handleValidation,
  authorize("agent"),
  balanceController.recordFloatReceived
);
// Retired legacy write endpoint.
//
// Commission Transfer must go through canonical POST /transactions followed
// by transaction completion so physical-SIM identity, idempotency and ledger
// posting cannot be bypassed by an older client.
router.post(
  "/commission-transfer",
  authorize("agent"),
  (_req, res) => {
    return res.status(410).json({
      success: false,
      code: "LEGACY_COMMISSION_TRANSFER_RETIRED",
      message:
        "This Commission Transfer endpoint has been retired. Update AgentPro and use the canonical transaction flow."
    });
  }
);
router.post("/cash-adjustment", authorize("agent"), balanceController.submitCashAdjustment);
router.patch("/cash-adjustment/:movement_id/review", authorize("superuser", "business_owner", "manager"), balanceController.reviewCashAdjustment);

module.exports = router;
