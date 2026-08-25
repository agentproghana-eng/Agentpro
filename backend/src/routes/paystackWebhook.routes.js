const express = require("express");

const controller = require("../controllers/paystackWebhookController");

const router = express.Router();

router.post("/", controller.handleWebhook);

module.exports = router;
