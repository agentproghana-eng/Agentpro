const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { getCommissionSummary } = require('../services/commissionService');
const {
  normalizeCommissionScopeValue,
  isSupportedProviderCommissionCombination,
} = require('../config/commissionRulePolicy');

router.use(authenticate);

// Get commission rules
router.get('/rules', authorize('superuser', 'business_owner'), async (req, res) => {
  try {
    let result;

    if (req.user.role === 'superuser') {
      result = await query(
        `SELECT *
         FROM commission_rules
         ORDER BY company_id NULLS LAST, created_at DESC`
      );
    } else {
      result = await query(
        `SELECT *
         FROM commission_rules
         WHERE company_id = $1 OR company_id IS NULL
         ORDER BY company_id NULLS LAST, created_at DESC`,
        [req.user.company_id]
      );
    }

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rules',
    });
  }
});

// Create commission rule (superuser only)
router.post('/rules', authorize('superuser'), async (req, res) => {
  const {
    company_id,
    provider,
    transaction_type,
    rate_percent,
    threshold_amount,
    cap_amount,
    effective_from,
  } = req.body;

  const normalizedProvider =
    normalizeCommissionScopeValue(
      provider
    );

  const normalizedTransactionType =
    normalizeCommissionScopeValue(
      transaction_type
    );

  if (
    !normalizedProvider ||
    !normalizedTransactionType
  ) {
    return res.status(422).json({
      success: false,
      code: 'COMMISSION_RULE_SCOPE_REQUIRED',
      message:
        'Provider and transaction type are required for every commission rule.',
    });
  }

  if (
    !isSupportedProviderCommissionCombination(
      normalizedProvider,
      normalizedTransactionType
    )
  ) {
    return res.status(422).json({
      success: false,
      code: 'COMMISSION_RULE_SCOPE_UNSUPPORTED',
      message:
        'Commission rules are allowed only for supported Agent Cash In/Deposit and Cash Out/Withdrawal transactions.',
    });
  }

  try {
    const result = await query(
      `INSERT INTO commission_rules (
         company_id,
         provider,
         transaction_type,
         rate_percent,
         threshold_amount,
         cap_amount,
         provider_share_percent,
         effective_from,
         approved_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       )
       RETURNING *`,
      [
        company_id || null,
        normalizedProvider,
        normalizedTransactionType,
        rate_percent,
        threshold_amount,
        cap_amount,
        0,
        effective_from || new Date(),
        req.user.id,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Failed to create rule',
    });
  }
});

// Get commission summary
router.get('/summary', authorize('superuser', 'business_owner', 'manager', 'agent', 'auditor'), async (req, res) => {
  try {
    const data = await getCommissionSummary({
      company_id:
        req.user.role !== 'superuser'
          ? req.user.company_id
          : req.query.company_id,
      manager_id:
        req.user.role === 'manager'
          ? req.user.id
          : undefined,
      agent_id:
        req.user.role === 'agent'
          ? req.user.id
          : req.query.agent_id,
      branch_id: req.query.branch_id,
      provider: req.query.provider,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      group_by: req.query.group_by || 'month',
    });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch commission summary' }); }
});

module.exports = router;
