const express = require('express');
const router = express.Router();
const userSimPurposeController = require('../controllers/userSimPurposeController');
const {
  authenticate,
  authorize,
} = require('../middleware/auth');

router.use(authenticate);

router.use(
  authorize(
    'business_owner',
    'manager',
    'agent'
  )
);

router.get('/', userSimPurposeController.listPurposes);
router.put('/', userSimPurposeController.setPurposes);

module.exports = router;
