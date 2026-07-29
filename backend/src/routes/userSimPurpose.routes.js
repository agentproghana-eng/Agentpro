const express = require('express');
const router = express.Router();
const userSimPurposeController = require('../controllers/userSimPurposeController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', userSimPurposeController.listPurposes);
router.put('/', userSimPurposeController.setPurposes);

module.exports = router;
