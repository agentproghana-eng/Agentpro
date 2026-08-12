const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendLowFloatAlert } = require('../services/notificationService');

// ── Branch access helpers ────────────────────────────────────

const VALID_PROVIDERS = new Set(['mtn', 'telecel', 'at_money']);

function positiveMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function nonNegativeMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

async function getAccessibleBranch(req, branchId, {
  managerMustManage = false,
  agentMustBeAssigned = false,
} = {}) {
  const conditions = ['b.id = $1', "b.status = 'active'"];
  const params = [branchId];

  if (req.user.role !== 'superuser') {
    params.push(req.user.company_id);
    conditions.push(`b.company_id = $${params.length}`);
  }

  if (
    managerMustManage &&
    req.user.role === 'manager'
  ) {
    params.push(req.user.id);
    conditions.push(
      `EXISTS (
         SELECT 1
         FROM branch_managers bm
         WHERE bm.branch_id = b.id
           AND bm.manager_id = $${params.length}
       )`
    );
  }

  if (
    agentMustBeAssigned &&
    req.user.role === 'agent'
  ) {
    params.push(req.user.id);
    conditions.push(
      `EXISTS (
         SELECT 1
         FROM agent_branches ab
         WHERE ab.branch_id = b.id
           AND ab.agent_id = $${params.length}
       )`
    );
  }

  const result = await query(
    `SELECT b.id, b.company_id, b.name
     FROM branches b
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}


// ── Get Float Overview for a Company ─────────────────────────

exports.getFloatOverview = async (req, res) => {
  const companyId =
    req.user.role === 'superuser'
      ? req.query.company_id
      : req.user.company_id;

  const { branch_id } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'company_id is required',
    });
  }

  try {
    const conditions = [
      'b.company_id = $1',
      "b.status = 'active'",
    ];

    const params = [companyId];

    if (req.user.role === 'manager') {
      params.push(req.user.id);

      conditions.push(
        `b.id IN (
           SELECT branch_id
           FROM branch_managers
           WHERE manager_id = $${params.length}
         )`
      );
    }

    if (branch_id) {
      params.push(branch_id);
      conditions.push(`b.id = $${params.length}`);
    }

    const result = await query(
      `SELECT fa.*, b.name as branch_name, b.id as branch_id
       FROM float_accounts fa
       INNER JOIN branches b ON fa.branch_id = b.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.name, fa.provider`,
      params
    );

    const totals = result.rows.reduce((acc, row) => {
      if (!acc[row.provider]) {
        acc[row.provider] = 0;
      }

      acc[row.provider] +=
        Number(row.current_balance || 0);

      return acc;
    }, {});

    const grandTotal = Object.values(totals)
      .reduce((sum, value) => sum + value, 0);

    return res.json({
      success: true,
      data: {
        accounts: result.rows,
        totals_by_provider: totals,
        grand_total: grandTotal,
      },
    });
  } catch (error) {
    logger.error('Float overview error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch float overview',
    });
  }
};


// ── Get Float for a Branch ────────────────────────────────────

exports.getBranchFloat = async (req, res) => {
  const { branch_id } = req.params;

  try {
    const branch = await getAccessibleBranch(
      req,
      branch_id,
      {
        managerMustManage: true,
        agentMustBeAssigned: true,
      }
    );

    if (!branch) {
      return res.status(403).json({
        success: false,
        message: 'Branch not found or access denied',
      });
    }

    const result = await query(
      `SELECT fa.*, b.name as branch_name, b.company_id
       FROM float_accounts fa
       INNER JOIN branches b
         ON fa.branch_id = b.id
       WHERE fa.branch_id = $1
       ORDER BY fa.provider`,
      [branch_id]
    );

    const total = result.rows.reduce(
      (sum, row) =>
        sum + Number(row.current_balance || 0),
      0
    );

    return res.json({
      success: true,
      data: {
        accounts: result.rows,
        total,
      },
    });
  } catch (error) {
    logger.error('Branch float error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branch float',
    });
  }
};


// ── Top Up Branch Float ───────────────────────────────────────

exports.topUpFloat = async (req, res) => {
  const {
    branch_id,
    provider,
    amount,
    reference,
    notes,
  } = req.body;

  const userId = req.user.id;
  const normalizedAmount = positiveMoney(amount);

  if (!branch_id) {
    return res.status(400).json({
      success: false,
      message: 'branch_id is required',
    });
  }

  if (!VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider',
    });
  }

  if (normalizedAmount === null) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than zero',
    });
  }

  try {
    const branch = await getAccessibleBranch(
      req,
      branch_id,
      {
        managerMustManage: true,
      }
    );

    if (!branch) {
      return res.status(403).json({
        success: false,
        message: 'Branch not found or access denied',
      });
    }

    let updatedFloat;

    await withTransaction(async (client) => {
      // Ensure the row exists, then lock the canonical branch/provider
      // treasury account before calculating the new balance.
      await client.query(
        `INSERT INTO float_accounts (
           branch_id,
           provider,
           current_balance
         )
         VALUES ($1, $2, 0)
         ON CONFLICT (branch_id, provider)
         DO NOTHING`,
        [branch_id, provider]
      );

      const floatResult = await client.query(
        `SELECT *
         FROM float_accounts
         WHERE branch_id = $1
           AND provider = $2
         FOR UPDATE`,
        [branch_id, provider]
      );

      if (floatResult.rows.length !== 1) {
        throw new Error(
          'Unable to lock branch float account'
        );
      }

      const float = floatResult.rows[0];
      const balanceBefore =
        Number(float.current_balance || 0);

      const balanceAfter =
        balanceBefore + normalizedAmount;

      const updateResult = await client.query(
        `UPDATE float_accounts
         SET current_balance = $1,
             last_updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [balanceAfter, float.id]
      );

      if (updateResult.rows.length !== 1) {
        throw new Error(
          'Unable to update branch float account'
        );
      }

      updatedFloat = updateResult.rows[0];

      await client.query(
        `INSERT INTO float_movements (
           float_account_id,
           movement_type,
           amount,
           balance_before,
           balance_after,
           reference,
           notes,
           performed_by
         )
         VALUES (
           $1,
           'top_up',
           $2,
           $3,
           $4,
           $5,
           $6,
           $7
         )`,
        [
          float.id,
          normalizedAmount,
          balanceBefore,
          balanceAfter,
          reference || null,
          notes || null,
          userId,
        ]
      );
    });

    await auditLog({
      userId,
      companyId: branch.company_id,
      action: 'FLOAT_TOP_UP',
      entityType: 'float_account',
      entityId: updatedFloat?.id,
      newValues: {
        branch_id,
        provider,
        amount: normalizedAmount,
        reference,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    return res.json({
      success: true,
      message: 'Float topped up successfully',
      data: updatedFloat,
    });
  } catch (error) {
    logger.error('Float top-up error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to top up float',
    });
  }
};


// ── Float Movement History ────────────────────────────────────

exports.getFloatHistory = async (req, res) => {
  const {
    branch_id,
    provider,
    from_date,
    to_date,
    page = 1,
    limit = 30,
  } = req.query;

  const parsedPage =
    Math.max(1, Number.parseInt(page, 10) || 1);

  const parsedLimit =
    Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 30)
    );

  const offset =
    (parsedPage - 1) * parsedLimit;

  if (
    provider &&
    !VALID_PROVIDERS.has(provider)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider',
    });
  }

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (branch_id) {
      conditions.push(
        `fa.branch_id = $${idx++}`
      );
      params.push(branch_id);
    }

    if (provider) {
      conditions.push(
        `fa.provider = $${idx++}`
      );
      params.push(provider);
    }

    if (from_date) {
      conditions.push(
        `fm.created_at >= $${idx++}`
      );
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(
        `fm.created_at <= $${idx++}`
      );
      params.push(to_date);
    }

    if (req.user.role !== 'superuser') {
      conditions.push(
        `b.company_id = $${idx++}`
      );
      params.push(req.user.company_id);
    }

    if (req.user.role === 'manager') {
      conditions.push(
        `EXISTS (
           SELECT 1
           FROM branch_managers bm
           WHERE bm.branch_id = b.id
             AND bm.manager_id = $${idx++}
         )`
      );

      params.push(req.user.id);
    }

    const where =
      conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    const dataParams = [
      ...params,
      parsedLimit,
      offset,
    ];

    const limitParam =
      params.length + 1;

    const offsetParam =
      params.length + 2;

    const [data, count] =
      await Promise.all([
        query(
          `SELECT
             fm.*,
             fa.provider,
             fa.branch_id,
             b.name as branch_name,
             u.first_name || ' ' ||
               u.last_name as performed_by_name
           FROM float_movements fm
           INNER JOIN float_accounts fa
             ON fm.float_account_id = fa.id
           INNER JOIN branches b
             ON fa.branch_id = b.id
           LEFT JOIN users u
             ON fm.performed_by = u.id
           ${where}
           ORDER BY fm.created_at DESC
           LIMIT $${limitParam}
           OFFSET $${offsetParam}`,
          dataParams
        ),
        query(
          `SELECT COUNT(*)
           FROM float_movements fm
           INNER JOIN float_accounts fa
             ON fm.float_account_id = fa.id
           INNER JOIN branches b
             ON fa.branch_id = b.id
           ${where}`,
          params
        ),
      ]);

    const total =
      Number.parseInt(
        count.rows[0]?.count || '0',
        10
      );

    return res.json({
      success: true,
      data: data.rows,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        total_pages:
          Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('Float history error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch float history',
    });
  }
};


// ── Update Low Float Threshold ────────────────────────────────

exports.updateThreshold = async (req, res) => {
  const {
    branch_id,
    provider,
    threshold,
  } = req.body;

  const normalizedThreshold =
    nonNegativeMoney(threshold);

  if (!branch_id) {
    return res.status(400).json({
      success: false,
      message: 'branch_id is required',
    });
  }

  if (!VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider',
    });
  }

  if (normalizedThreshold === null) {
    return res.status(400).json({
      success: false,
      message: 'Threshold must be zero or greater',
    });
  }

  try {
    const branch = await getAccessibleBranch(
      req,
      branch_id,
      {
        managerMustManage: true,
      }
    );

    if (!branch) {
      return res.status(403).json({
        success: false,
        message: 'Branch not found or access denied',
      });
    }

    const result = await query(
      `UPDATE float_accounts
       SET low_balance_threshold = $1
       WHERE branch_id = $2
         AND provider = $3
       RETURNING *`,
      [
        normalizedThreshold,
        branch_id,
        provider,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Float account not found',
      });
    }

    return res.json({
      success: true,
      message: 'Threshold updated',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(
      'Threshold update error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to update threshold',
    });
  }
};


// ── Submit Float Request (Agent → Manager) ────────────────────

exports.submitFloatRequest = async (req, res) => {
  const {
    branch_id,
    provider,
    amount_requested,
    reason,
  } = req.body;

  const amount =
    positiveMoney(amount_requested);

  if (!branch_id) {
    return res.status(400).json({
      success: false,
      message: 'branch_id is required',
    });
  }

  if (!VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider',
    });
  }

  if (amount === null) {
    return res.status(400).json({
      success: false,
      message: 'Requested amount must be greater than zero',
    });
  }

  try {
    const branch = await getAccessibleBranch(
      req,
      branch_id,
      {
        agentMustBeAssigned: true,
      }
    );

    if (!branch) {
      return res.status(403).json({
        success: false,
        message: 'Branch not found or access denied',
      });
    }

    const result = await query(
      `INSERT INTO float_requests (
         branch_id,
         requested_by,
         provider,
         amount_requested,
         reason
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        branch_id,
        req.user.id,
        provider,
        amount,
        reason || null,
      ]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Float request submitted',
    });
  } catch (error) {
    logger.error('Float request error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit float request',
    });
  }
};


// ── Review Float Request (Manager) ───────────────────────────

exports.reviewFloatRequest = async (req, res) => {
  const { request_id } = req.params;
  const { status, review_notes } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'status must be approved or rejected',
    });
  }

  try {
    const conditions = [
      'fr.id = $1',
      "fr.status = 'pending'",
    ];

    const params = [request_id];

    if (req.user.role !== 'superuser') {
      params.push(req.user.company_id);

      conditions.push(
        `b.company_id = $${params.length}`
      );
    }

    if (req.user.role === 'manager') {
      params.push(req.user.id);

      conditions.push(
        `EXISTS (
           SELECT 1
           FROM branch_managers bm
           WHERE bm.branch_id = fr.branch_id
             AND bm.manager_id = $${params.length}
         )`
      );
    }

    const requestResult = await query(
      `SELECT fr.id
       FROM float_requests fr
       INNER JOIN branches b
         ON b.id = fr.branch_id
       WHERE ${conditions.join(' AND ')}
       LIMIT 1`,
      params
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pending float request not found or access denied',
      });
    }

    const result = await query(
      `UPDATE float_requests
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_notes = $3
       WHERE id = $4
         AND status = 'pending'
       RETURNING *`,
      [
        status,
        req.user.id,
        review_notes || null,
        request_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: 'Float request has already been reviewed',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(
      'Float request review error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to review float request',
    });
  }
};
