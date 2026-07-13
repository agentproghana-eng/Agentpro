const express = require("express");
const router = express.Router();
const balanceController = require("../controllers/balanceController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate);

router.get("/:agent_id?", authorize("superuser", "business_owner", "manager", "agent"), balanceController.getAgentBalances);
router.post("/cash-out-manual", authorize("agent"), balanceController.recordCashOutManual);
router.post("/float-received", authorize("agent"), balanceController.recordFloatReceived);
router.post("/commission-transfer", authorize("agent"), balanceController.recordCommissionTransfer);
router.post("/cash-adjustment", authorize("agent"), balanceController.submitCashAdjustment);
router.patch("/cash-adjustment/:movement_id/review", authorize("superuser", "business_owner", "manager"), balanceController.reviewCashAdjustment);

module.exports = router;
