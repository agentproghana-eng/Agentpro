const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const transactionController = require("../controllers/transactionController");
const {
  authenticate,
  authorize,
  requireActiveSubscription,
} = require("../middleware/auth");
const {
  createInitiationCapabilityGuard,
} = require("../middleware/transactionCapability");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// All transaction routes require authentication and active subscription
router.use(authenticate);
router.use(requireActiveSubscription);

const businessInitiationCapabilityGuard =
  createInitiationCapabilityGuard("business");

const NO_AMOUNT_BUSINESS_TYPES = new Set([
  "balance_enquiry",
  "mini_statement",
  "commission_balance",
  "cash_in_commission",
]);

// Mirrors the Business transaction form's actual provider inputs.
// Types intentionally absent from this set either use another identifier
// (send_money / merchant_payment), require no customer input, or are
// disabled by the capability layer.
const CUSTOMER_PHONE_BUSINESS_TYPES = new Set([
  "cash_in",
  "cash_out",
  "pay_to_agent",
  "airtime",
  "data_bundle",
  "business_deposit",
  "business_withdrawal",
  "reversal",
]);

const requiresCustomerPhone = (payload) => {
  const type = payload?.transaction_type;
  const provider = payload?.provider;

  // Telecel Agent Data Bundle selects a bundle directly from the provider
  // menu and has no recipient/customer-phone step.
  if (type === "data_bundle" && provider === "telecel") {
    return false;
  }

  return CUSTOMER_PHONE_BUSINESS_TYPES.has(type);
};

const requireNonBlankStringWhen =
  (shouldRequire, message) =>
  (value, { req }) => {
    if (!shouldRequire(req.body)) {
      return true;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(message);
    }

    return true;
  };

const finiteNumber = (value) => {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

// POST /api/v1/transactions — Initiate a transaction
router.post(
  "/",
  [
    body("provider")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Invalid provider"),
    body("client_operation_id")
      .isUUID()
      .withMessage("client_operation_id must be a valid UUID"),
    body("sim_iccid")
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 100 })
      .withMessage("sim_iccid is invalid"),
    body("sim_slot")
      .optional({ nullable: true })
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
      .withMessage("sim_subscription_id must be a non-negative integer")
      .toInt(),
    body("sim_role")
      .optional({ nullable: true, checkFalsy: true })
      .isIn(["agent", "evd", "merchant"])
      .withMessage("sim_role must be agent, evd, or merchant"),
    body("transaction_type")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Invalid transaction type"),

    // Optional fields are still type-checked when supplied. Flutter sends
    // irrelevant Business fields as empty strings, which remain valid.
    body("customer_phone")
      .optional({ nullable: true })
      .isString()
      .withMessage("customer_phone must be a string")
      .trim(),
    body("recipient_phone")
      .optional({ nullable: true })
      .isString()
      .withMessage("recipient_phone must be a string")
      .trim(),
    body("payment_reference")
      .optional({ nullable: true })
      .isString()
      .withMessage("payment_reference must be a string")
      .trim(),
    body("merchant_id")
      .optional({ nullable: true })
      .isString()
      .withMessage("merchant_id must be a string")
      .trim(),

    // Required fields depend on the actual financial operation.
    body("customer_phone").custom(
      requireNonBlankStringWhen(
        requiresCustomerPhone,
        "Phone number is required for this transaction type",
      ),
    ),
    body("recipient_phone").custom(
      requireNonBlankStringWhen(
        (payload) => payload?.transaction_type === "send_money",
        "Recipient phone number is required for Send Money",
      ),
    ),
    body("payment_reference").custom(
      requireNonBlankStringWhen(
        (payload) =>
          payload?.transaction_type === "pay_to_agent" ||
          payload?.transaction_type === "merchant_payment",
        "Reference is required for this transaction type",
      ),
    ),
    body("merchant_id").custom(
      requireNonBlankStringWhen(
        (payload) => payload?.transaction_type === "merchant_payment",
        "Merchant ID is required for Pay to Merchant",
      ),
    ),

    body("fee")
      .optional({ nullable: true, checkFalsy: true })
      .isFloat({ min: 0 })
      .withMessage("Transfer Charges must be zero or greater")
      .toFloat(),

    body("amount").custom((value, { req }) => {
      const type = req.body.transaction_type;

      if (NO_AMOUNT_BUSINESS_TYPES.has(type)) {
        if (
          value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          return true;
        }

        const amount = finiteNumber(value);

        if (amount === 0) {
          return true;
        }

        throw new Error(
          "Amount must be zero or omitted for this transaction type",
        );
      }

      const amount = finiteNumber(value);

      if (amount === null || amount < 0.01) {
        throw new Error("Amount must be a positive number");
      }

      return true;
    }),
  ],
  handleValidation,
  businessInitiationCapabilityGuard,
  authorize("agent", "business_owner", "manager"),
  transactionController.initiateTransaction,
);

// PATCH /api/v1/transactions/:transaction_id/complete — Mark success, failure, or unconfirmed
router.patch(
  "/:transaction_id/complete",
  [
    body("status")
      .isIn(["success", "failed", "pending_confirmation"])
      .withMessage("Status must be success, failed, or pending_confirmation"),
  ],
  handleValidation,
  authorize("agent", "business_owner", "manager"),
  transactionController.completeTransaction,
);

// GET /api/v1/transactions — List transactions
router.get(
  "/",
  authorize("superuser", "business_owner", "manager", "agent", "auditor"),
  transactionController.listTransactions,
);

// GET /api/v1/transactions/:transaction_id — Get single transaction
router.get(
  "/:transaction_id",
  authorize("superuser", "business_owner", "manager", "agent", "auditor"),
  transactionController.getTransaction,
);

module.exports = router;
