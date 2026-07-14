const express = require("express");
const router = express.Router();
const ussdOverrideController = require("../controllers/ussdOverrideController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate);
router.use(authorize("agent"));

router.get("/", ussdOverrideController.listOverrides);
router.put("/", ussdOverrideController.saveOverride);
router.delete("/:override_id", ussdOverrideController.deleteOverride);

module.exports = router;
