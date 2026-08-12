const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendLowFloatAlert } = require('../services/notificationService');

// ── Branch access helpers ────────────────────────────────────

const VALID_PROVIDERS = new Set(['mtn', 'telecel', 'at_money']);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function numericMoney(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : null;
}

function positiveMoney(value) {
  const amount = numericMoney(value);

  if (amount === null || amount <= 0) {
    return null;
  }

  return amount;
}

function nonNegativeMoney(value) {
  const amount = numericMoney(value);

  if (amount === null || amount < 0) {
    return null;
  }

  return amount;
}

function isValidUuid(value) {
  return (
    typeof value === 'string' &&
    UUID_PATTERN.test(value.trim())
  );
}

function positiveTwoDecimalMoney(value) {
  const amount = positiveMoney(value);

  if (amount === null) {
    return null;
  }

  // float_accounts / float_movements use DECIMAL(15, 2).
  // Reject precision that cannot be represented rather than silently
  // rounding a financial request to a different amount.
  const canonical = amount.toFixed(2);
  const canonicalNumber = Number(canonical);

  if (
    Math.abs(amount - canonicalNumber) > 1e-9 ||
    canonicalNumber > 9999999999999.99
  ) {
    return null;
  }

  return canonical;
}

function floatAccountResponse(row) {
  return {
    id: row.id,
    branch_id: row.branch_id,
    provider: row.provider,
    current_balance: row.current_balance,
    low_balance_threshold:
      row.low_balance_threshold,
    last_updated_at: row.last_updated_at,
    created_at: row.created_at,
  };
}

function parseDateFilter(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    return undefined;
  }

  const parsed = new Date(value.trim());

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function normalizedOptionalText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function isSameTopUpOperation(existing, {
  branchId,
  provider,
  amount,
  reference,
  notes,
}) {
  return (
    String(existing.branch_id || '') === String(branchId) &&
    existing.provider === provider &&
    existing.movement_type === 'top_up' &&
    Number(existing.movement_amount).toFixed(2) === amount &&
    String(existing.movement_reference || '') === reference &&
    String(existing.movement_notes || '') === notes
  );
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
    client_operation_id,
  } = req.body;

  const userId = req.user.id;
  const normalizedAmount =
    positiveTwoDecimalMoney(amount);
  const normalizedReference =
    normalizedOptionalText(reference);
  const normalizedNotes =
    normalizedOptionalText(notes);

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

  if (!isValidUuid(client_operation_id)) {
    return res.status(400).json({
      success: false,
      message:
        'client_operation_id must be a valid UUID',
    });
  }

  const operationId =
    client_operation_id.trim();

  let branch;

  try {
    branch = await getAccessibleBranch(
      req,
      branch_id,
      {
        managerMustManage: true,
      }
    );

    if (!branch) {
      return res.status(403).json({
        success: false,
        message:
          'Branch not found or access denied',
      });
    }

    const operation =
      await withTransaction(async (client) => {
        // Keep the canonical branch/provider treasury row available,
        // then serialize changes to that account with FOR UPDATE.
        await client.query(
          `INSERT INTO float_accounts (
             branch_id,
             provider,
             current_balance
           )
           VALUES ($1, $2, 0)
           ON CONFLICT (branch_id, provider)
           DO NOTHING`,
          [
            branch_id,
            provider,
          ]
        );

        const floatResult =
          await client.query(
            `SELECT *
             FROM float_accounts
             WHERE branch_id = $1
               AND provider = $2
             FOR UPDATE`,
            [
              branch_id,
              provider,
            ]
          );

        if (floatResult.rows.length !== 1) {
          throw new Error(
            'Unable to lock branch float account'
          );
        }

        const float = floatResult.rows[0];

        // Re-check the operation after obtaining the account lock.
        // This catches an identical request that waited behind another
        // top-up transaction for the same branch/provider.
        const existingResult =
          await client.query(
            `SELECT
               fm.id as movement_id,
               fm.movement_type,
               fm.amount as movement_amount,
               fm.reference as movement_reference,
               fm.notes as movement_notes,
               fm.client_operation_id,
               fa.*
             FROM float_movements fm
             INNER JOIN float_accounts fa
               ON fa.id = fm.float_account_id
             WHERE fm.performed_by = $1
               AND fm.client_operation_id = $2
             LIMIT 1`,
            [
              userId,
              operationId,
            ]
          );

        if (existingResult.rows.length > 0) {
          const existing =
            existingResult.rows[0];

          if (
            !isSameTopUpOperation(existing, {
              branchId: branch_id,
              provider,
              amount: normalizedAmount,
              reference:
                normalizedReference,
              notes: normalizedNotes,
            })
          ) {
            throw {
              statusCode: 409,
              code:
                'CLIENT_OPERATION_CONFLICT',
              message:
                'client_operation_id has already been used for a different top-up',
            };
          }

          return {
            updatedFloat:
              floatAccountResponse(existing),
            idempotentReplay: true,
          };
        }

        const balanceBefore =
          String(
            float.current_balance ?? '0'
          );

        // Let PostgreSQL DECIMAL perform the monetary arithmetic.
        // Do not convert the stored treasury balance to a JS Number.
        const updateResult =
          await client.query(
            `UPDATE float_accounts
             SET current_balance =
                   current_balance + $1::numeric,
                 last_updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [
              normalizedAmount,
              float.id,
            ]
          );

        if (updateResult.rows.length !== 1) {
          throw new Error(
            'Unable to update branch float account'
          );
        }

        const updatedFloat =
          updateResult.rows[0];

        const balanceAfter =
          String(
            updatedFloat.current_balance ?? '0'
          );

        await client.query(
          `INSERT INTO float_movements (
             float_account_id,
             movement_type,
             amount,
             balance_before,
             balance_after,
             reference,
             notes,
             performed_by,
             client_operation_id
           )
           VALUES (
             $1,
             'top_up',
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8
           )`,
          [
            float.id,
            normalizedAmount,
            balanceBefore,
            balanceAfter,
            normalizedReference || null,
            normalizedNotes || null,
            userId,
            operationId,
          ]
        );

        return {
          updatedFloat:
            floatAccountResponse(updatedFloat),
          idempotentReplay: false,
        };
      });

    // Replays must not create duplicate audit events.
    if (!operation.idempotentReplay) {
      await auditLog({
        userId,
        companyId: branch.company_id,
        action: 'FLOAT_TOP_UP',
        entityType: 'float_account',
        entityId:
          operation.updatedFloat?.id,
        newValues: {
          branch_id,
          provider,
          amount: normalizedAmount,
          reference:
            normalizedReference || null,
          client_operation_id:
            operationId,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
      });
    }

    return res.json({
      success: true,
      message:
        'Float topped up successfully',
      data: operation.updatedFloat,
      idempotent_replay:
        operation.idempotentReplay,
    });
  } catch (error) {
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({
          success: false,
          ...(error.code
            ? { code: error.code }
            : {}),
          message: error.message,
        });
    }

    // If two requests using the same operation ID race on different
    // treasury accounts, the unique index is the final concurrency
    // barrier. PostgreSQL rolls back the losing transaction, including
    // its preceding balance UPDATE. Resolve the committed winner here.
    if (
      error.code === '23505' &&
      error.constraint ===
        'idx_float_movements_performer_client_operation'
    ) {
      try {
        const winnerResult =
          await query(
            `SELECT
               fm.id as movement_id,
               fm.movement_type,
               fm.amount as movement_amount,
               fm.reference as movement_reference,
               fm.notes as movement_notes,
               fm.client_operation_id,
               fa.*
             FROM float_movements fm
             INNER JOIN float_accounts fa
               ON fa.id = fm.float_account_id
             WHERE fm.performed_by = $1
               AND fm.client_operation_id = $2
             LIMIT 1`,
            [
              userId,
              operationId,
            ]
          );

        const winner =
          winnerResult.rows[0];

        if (
          winner &&
          isSameTopUpOperation(winner, {
            branchId: branch_id,
            provider,
            amount: normalizedAmount,
            reference:
              normalizedReference,
            notes: normalizedNotes,
          })
        ) {
          return res.json({
            success: true,
            message:
              'Float topped up successfully',
            data:
              floatAccountResponse(winner),
            idempotent_replay: true,
          });
        }

        if (winner) {
          return res.status(409).json({
            success: false,
            code:
              'CLIENT_OPERATION_CONFLICT',
            message:
              'client_operation_id has already been used for a different top-up',
          });
        }
      } catch (recoveryError) {
        logger.error(
          'Float top-up idempotency recovery error:',
          recoveryError
        );
      }
    }

    logger.error(
      'Float top-up error:',
      error
    );

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

  const parsedFromDate =
    from_date === undefined
      ? null
      : parseDateFilter(from_date);

  const parsedToDate =
    to_date === undefined
      ? null
      : parseDateFilter(to_date);

  if (
    from_date !== undefined &&
    parsedFromDate === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid from_date',
    });
  }

  if (
    to_date !== undefined &&
    parsedToDate === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid to_date',
    });
  }

  if (
    parsedFromDate &&
    parsedToDate &&
    parsedFromDate.getTime() >
      parsedToDate.getTime()
  ) {
    return res.status(400).json({
      success: false,
      message:
        'from_date must be before or equal to to_date',
    });
  }

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

    if (parsedFromDate) {
      conditions.push(
        `fm.created_at >= $${idx++}`
      );
      params.push(parsedFromDate);
    }

    if (parsedToDate) {
      conditions.push(
        `fm.created_at <= $${idx++}`
      );
      params.push(parsedToDate);
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


// ── List Float Requests ───────────────────────────────────────

exports.listFloatRequests = async (req, res) => {
  const {
    status,
    page = 1,
    limit = 30,
  } = req.query;

  const validStatuses = new Set([
    'pending',
    'approved',
    'rejected',
  ]);

  if (status && !validStatuses.has(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid float request status',
    });
  }

  const parsedPage =
    Math.max(1, Number.parseInt(page, 10) || 1);

  const parsedLimit =
    Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 30)
    );

  const offset =
    (parsedPage - 1) * parsedLimit;

  try {
    const conditions = [];
    const params = [];

    // All roles exposed by the route are business-scoped.
    params.push(req.user.company_id);
    conditions.push(
      `b.company_id = $${params.length}`
    );

    if (req.user.role === 'agent') {
      params.push(req.user.id);
      const userParam = `$${params.length}`;

      // Agents can only see their own requests and only for branches
      // to which they are currently assigned.
      conditions.push(
        `fr.requested_by = ${userParam}`
      );

      conditions.push(
        `EXISTS (
           SELECT 1
           FROM agent_branches ab
           WHERE ab.branch_id = fr.branch_id
             AND ab.agent_id = ${userParam}
         )`
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

    if (status) {
      params.push(status);
      conditions.push(
        `fr.status = $${params.length}`
      );
    }

    const where =
      `WHERE ${conditions.join(' AND ')}`;

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
             fr.id,
             fr.branch_id,
             b.name as branch_name,
             fr.requested_by,
             requester.first_name ||
               ' ' ||
               requester.last_name
               as requested_by_name,
             fr.provider,
             fr.amount_requested,
             fr.reason,
             fr.status,
             fr.reviewed_by,
             reviewer.first_name ||
               ' ' ||
               reviewer.last_name
               as reviewed_by_name,
             fr.reviewed_at,
             fr.review_notes,
             fr.created_at
           FROM float_requests fr
           INNER JOIN branches b
             ON b.id = fr.branch_id
           INNER JOIN users requester
             ON requester.id = fr.requested_by
           LEFT JOIN users reviewer
             ON reviewer.id = fr.reviewed_by
           ${where}
           ORDER BY fr.created_at DESC
           LIMIT $${limitParam}
           OFFSET $${offsetParam}`,
          dataParams
        ),
        query(
          `SELECT COUNT(*)
           FROM float_requests fr
           INNER JOIN branches b
             ON b.id = fr.branch_id
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
    logger.error(
      'List float requests error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch float requests',
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
