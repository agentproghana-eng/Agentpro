const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const {
  getOrCreateAgentSimWallet,
} = require('../services/agentWalletService');

// A shift reconciles against the agent's single physical cash drawer.
// Electronic provider wallets are separate and must never be summed to
// derive physical cash.
async function getExpectedCash(client, agentId) {
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT cash_at_hand
        FROM agent_cash_balances
        WHERE agent_id = $1),
       0
     ) AS total`,
    [agentId]
  );
  return parseFloat(result.rows[0].total);
}

async function getVarianceThreshold() {
  const result = await query(`SELECT value FROM system_config WHERE key = 'shift_variance_flag_threshold'`);
  return parseFloat(result.rows[0]?.value || '20.00');
}

exports.openShift = async (req, res) => {
  const agentId = req.user.id;
  const companyId = req.user.company_id;
  const {
    opening_cash_declared,
    opening_sim_balances = [],
  } = req.body || {};

  if (
    opening_cash_declared === undefined ||
    opening_cash_declared === null ||
    String(opening_cash_declared).trim() === '' ||
    !Number.isFinite(Number(opening_cash_declared))
  ) {
    return res.status(422).json({
      success: false,
      message:
        'opening_cash_declared is required and must be a number',
    });
  }

  if (Number(opening_cash_declared) < 0) {
    return res.status(422).json({
      success: false,
      message:
        'opening_cash_declared is required and must be a non-negative number',
    });
  }

  if (!Array.isArray(opening_sim_balances)) {
    return res.status(422).json({
      success: false,
      message: 'opening_sim_balances must be an array',
    });
  }

  const isNonNegativeAmount = (value) => {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    ) {
      return false;
    }

    const amount = Number(value);

    return Number.isFinite(amount) && amount >= 0;
  };

  for (const declaration of opening_sim_balances) {
    if (!isNonNegativeAmount(declaration?.e_float_declared)) {
      return res.status(422).json({
        success: false,
        message:
          'e_float_declared is required for every SIM and must be a non-negative number',
      });
    }

    if (!isNonNegativeAmount(declaration?.commission_declared)) {
      return res.status(422).json({
        success: false,
        message:
          'commission_declared is required for every SIM and must be a non-negative number',
      });
    }

    if (
      declaration?.provider !== 'telecel' &&
      declaration?.working_declared !== undefined &&
      declaration?.working_declared !== null
    ) {
      return res.status(422).json({
        success: false,
        message:
          'working_declared is only allowed for Telecel SIMs',
      });
    }

    if (
      declaration?.provider === 'telecel' &&
      !isNonNegativeAmount(declaration?.working_declared)
    ) {
      return res.status(422).json({
        success: false,
        message:
          'working_declared is required for Telecel SIMs and must be a non-negative number',
      });
    }
  }

  try {
    const branchResult = await query(
      `SELECT branch_id FROM agent_branches WHERE agent_id = $1 AND is_primary = true LIMIT 1`,
      [agentId]
    );
    const branchId = branchResult.rows[0]?.branch_id || null;

    const shift = await withTransaction(async (client) => {
      const openingCash = await getExpectedCash(client, agentId);
      const openingDeclared = parseFloat(opening_cash_declared);
      const openingVariance = openingDeclared - openingCash;

      const result = await client.query(
        `INSERT INTO shifts (
           agent_id,
           branch_id,
           company_id,
           opening_cash_expected,
           opening_cash_declared,
           opening_cash_variance
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          agentId,
          branchId,
          companyId,
          openingCash,
          openingDeclared,
          openingVariance,
        ]
      );

      for (const declaration of opening_sim_balances) {
        const wallet = await getOrCreateAgentSimWallet(
          client,
          {
            agentId,
            provider: declaration.provider,
            simIccid: declaration.sim_iccid,
            installationId: declaration.installation_id,
            simSubscriptionId:
              declaration.sim_subscription_id,
            simSlot: declaration.sim_slot,
          }
        );

        const snapshotOpeningBalance = async (
          balanceType,
          expectedValue,
          declaredValue
        ) => {
          if (
            declaredValue === undefined ||
            declaredValue === null
          ) {
            return;
          }

          const expected = parseFloat(expectedValue || 0);
          const declared = parseFloat(declaredValue);
          const variance = declared - expected;

          await client.query(
            `INSERT INTO shift_sim_balance_snapshots (
               shift_id,
               sim_wallet_id,
               balance_type,
               opening_expected,
               opening_declared,
               opening_variance
             )
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              result.rows[0].id,
              wallet.id,
              balanceType,
              expected,
              declared,
              variance,
            ]
          );
        };

        await snapshotOpeningBalance(
          'e_float',
          wallet.e_float_balance,
          declaration.e_float_declared
        );

        await snapshotOpeningBalance(
          'commission',
          wallet.commission_balance,
          declaration.commission_declared
        );

        await snapshotOpeningBalance(
          'working_balance',
          wallet.working_balance,
          declaration.working_declared
        );
      }

      const openedShift = result.rows[0];

      await auditLog({
        userId: agentId,
        companyId,
        action: 'SHIFT_OPENED',
        entityType: 'shift',
        entityId: openedShift.id,
        newValues: {
          opening_cash_expected:
            openedShift.opening_cash_expected,
          opening_cash_declared:
            openedShift.opening_cash_declared,
          opening_cash_variance:
            openedShift.opening_cash_variance,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });

      return openedShift;
    });

    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'You already have an open shift. Close it before opening a new one.' });
    }
    logger.error('Open shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to open shift' });
  }
};

exports.getCurrentShift = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM shifts WHERE agent_id = $1 AND status = 'open' LIMIT 1`,
      [req.user.id]
    );

    const shift = result.rows[0] || null;

    if (shift === null) {
      return res.json({ success: true, data: null });
    }

    const snapshotResult = await query(
      `SELECT
         snapshot.id AS snapshot_id,
         snapshot.sim_wallet_id,
         wallet.provider,
         wallet.identity_status,
         wallet.sim_iccid,
         wallet.installation_id,
         wallet.sim_subscription_id,
         wallet.last_known_sim_slot,
         snapshot.balance_type,
         snapshot.opening_expected,
         snapshot.opening_declared,
         snapshot.opening_variance
       FROM shift_sim_balance_snapshots snapshot
       JOIN agent_sim_wallets wallet
         ON wallet.id = snapshot.sim_wallet_id
       WHERE snapshot.shift_id = $1
       ORDER BY snapshot.id`,
      [shift.id]
    );

    const walletsById = new Map();

    for (const snapshot of snapshotResult.rows) {
      let group = walletsById.get(snapshot.sim_wallet_id);

      if (group === undefined) {
        group = {
          sim_wallet_id: snapshot.sim_wallet_id,
          provider: snapshot.provider,
          identity_status: snapshot.identity_status,
          sim_iccid: snapshot.sim_iccid,
          installation_id: snapshot.installation_id,
          sim_subscription_id: snapshot.sim_subscription_id,
          sim_slot: snapshot.last_known_sim_slot,
          balances: [],
        };

        walletsById.set(snapshot.sim_wallet_id, group);
      }

      group.balances.push({
        balance_type: snapshot.balance_type,
        opening_expected: snapshot.opening_expected,
        opening_declared: snapshot.opening_declared,
        opening_variance: snapshot.opening_variance,
      });
    }

    return res.json({
      success: true,
      data: {
        ...shift,
        opening_sim_balances: Array.from(walletsById.values()),
      },
    });
  } catch (error) {
    logger.error('Get current shift error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch current shift',
    });
  }
};

exports.closeShift = async (req, res) => {
  const { shift_id } = req.params;
  const {
    closing_cash_declared,
    closing_cash_actual,
    closing_sim_balances = [],
    notes,
  } = req.body || {};
  const agentId = req.user.id;

  // closing_cash_declared is the new reconciliation contract.
  // closing_cash_actual remains accepted for backward compatibility
  // with existing AgentPro clients.
  const closingCashInput =
    closing_cash_declared ?? closing_cash_actual;

  if (
    closingCashInput === undefined ||
    closingCashInput === null ||
    String(closingCashInput).trim() === '' ||
    !Number.isFinite(Number(closingCashInput))
  ) {
    return res.status(422).json({
      success: false,
      message:
        'closing_cash_actual is required and must be a number',
    });
  }

  if (Number(closingCashInput) < 0) {
    return res.status(422).json({
      success: false,
      message: closing_cash_declared !== undefined
        ? 'closing_cash_declared is required and must be a non-negative number'
        : 'closing_cash_actual is required and must be a non-negative number',
    });
  }

  if (!Array.isArray(closing_sim_balances)) {
    return res.status(422).json({
      success: false,
      message: 'closing_sim_balances must be an array',
    });
  }

  const hasMalformedClosingSimDeclaration =
    closing_sim_balances.some(
      (declaration) =>
        declaration === null ||
        typeof declaration !== 'object' ||
        Array.isArray(declaration) ||
        typeof declaration.sim_wallet_id !== 'string' ||
        declaration.sim_wallet_id.trim() === ''
    );

  if (hasMalformedClosingSimDeclaration) {
    return res.status(422).json({
      success: false,
      message:
        'every closing SIM balance must include a valid sim_wallet_id',
    });
  }

  const closingSimWalletIds = closing_sim_balances.map(
    (declaration) => declaration.sim_wallet_id
  );

  if (
    new Set(closingSimWalletIds).size !==
    closingSimWalletIds.length
  ) {
    return res.status(422).json({
      success: false,
      message:
        'closing_sim_balances must not contain duplicate sim_wallet_id values',
    });
  }

  try {
    const shiftResult = await query(
      `SELECT * FROM shifts WHERE id = $1 AND agent_id = $2 AND status = 'open'`,
      [shift_id, agentId]
    );
    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Open shift not found' });
    }
    const shift = shiftResult.rows[0];

    const closed = await withTransaction(async (client) => {
      const closingExpected = await getExpectedCash(client, agentId);
      const actual = Number(closingCashInput);
      const variance = actual - closingExpected;

      if (closing_sim_balances.length === 0) {
        const snapshotPresenceResult = await client.query(
          `SELECT id
           FROM shift_sim_balance_snapshots
           WHERE shift_id = $1
           FOR UPDATE`,
          [shift_id]
        );

        if (snapshotPresenceResult.rows.length > 0) {
          const error = new Error(
            'closing_sim_balances is required because this shift has electronic balance snapshots'
          );

          error.statusCode = 422;
          throw error;
        }
      }

      if (closing_sim_balances.length > 0) {
        const snapshotResult = await client.query(
          `SELECT
             snapshot.id AS snapshot_id,
             snapshot.sim_wallet_id,
             wallet.provider,
             snapshot.balance_type,
             CASE snapshot.balance_type
               WHEN 'e_float'
                 THEN wallet.e_float_balance
               WHEN 'commission'
                 THEN wallet.commission_balance
               WHEN 'working_balance'
                 THEN wallet.working_balance
             END AS closing_expected
           FROM shift_sim_balance_snapshots snapshot
           JOIN agent_sim_wallets wallet
             ON wallet.id = snapshot.sim_wallet_id
           WHERE snapshot.shift_id = $1
           ORDER BY snapshot.id
           FOR UPDATE OF snapshot`,
          [shift_id]
        );

        const declarationsByWallet = new Map(
          closing_sim_balances.map(
            (declaration) => [
              declaration.sim_wallet_id,
              declaration,
            ]
          )
        );

        const capturedWalletIds = new Set(
          snapshotResult.rows.map(
            (snapshot) => snapshot.sim_wallet_id
          )
        );

        const hasUnknownWallet =
          closing_sim_balances.some(
            (declaration) =>
              !capturedWalletIds.has(
                declaration.sim_wallet_id
              )
          );

        if (hasUnknownWallet) {
          const error = new Error(
            'closing_sim_balances contains a SIM wallet that was not captured when this shift opened'
          );

          error.statusCode = 422;
          throw error;
        }

        const getClosingDeclaredValue = (
          declaration,
          balanceType
        ) => {
          if (!declaration) {
            return undefined;
          }

          if (balanceType === 'e_float') {
            return declaration.e_float_declared;
          }

          if (balanceType === 'commission') {
            return declaration.commission_declared;
          }

          if (balanceType === 'working_balance') {
            return declaration.working_declared;
          }

          return undefined;
        };

        const closingBalanceErrorMessage = (
          balanceType
        ) => {
          if (balanceType === 'e_float') {
            return 'e_float_declared is required for every closing SIM balance and must be a non-negative number';
          }

          if (balanceType === 'commission') {
            return 'commission_declared is required for every closing SIM balance and must be a non-negative number';
          }

          return 'working_declared is required for every closing Telecel SIM balance and must be a non-negative number';
        };

        for (const snapshot of snapshotResult.rows) {
          const declaration = declarationsByWallet.get(
            snapshot.sim_wallet_id
          );

          const declaredValue =
            getClosingDeclaredValue(
              declaration,
              snapshot.balance_type
            );

          if (
            declaredValue === undefined ||
            declaredValue === null ||
            String(declaredValue).trim() === '' ||
            !Number.isFinite(Number(declaredValue)) ||
            Number(declaredValue) < 0
          ) {
            const error = new Error(
              closingBalanceErrorMessage(
                snapshot.balance_type
              )
            );

            error.statusCode = 422;
            throw error;
          }

          const expected =
            Number(snapshot.closing_expected || 0);
          const declared = Number(declaredValue);
          const closingVariance =
            declared - expected;

          await client.query(
            `UPDATE shift_sim_balance_snapshots
             SET closing_expected = $1,
                 closing_declared = $2,
                 closing_variance = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [
              expected,
              declared,
              closingVariance,
              snapshot.snapshot_id,
            ]
          );
        }
      }

      const txCountResult = await client.query(
        `SELECT COUNT(*) FROM transactions WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, shift.opened_at]
      );

      const result = await client.query(
        `UPDATE shifts SET
           status = 'closed',
           closing_cash_expected = $1,
           closing_cash_declared = $2,
           closing_cash_variance = $3,
           closing_cash_actual = $4,
           variance = $5,
           transaction_count = $6,
           notes = $7,
           closed_at = NOW()
         WHERE id = $8 RETURNING *`,
        [
          closingExpected,
          actual,
          variance,
          actual,
          variance,
          parseInt(txCountResult.rows[0].count),
          notes || null,
          shift_id,
        ]
      );

      const closedShift = result.rows[0];

      await auditLog({
        userId: agentId,
        companyId: req.user.company_id,
        action: 'SHIFT_CLOSED',
        entityType: 'shift',
        entityId: shift_id,
        newValues: {
          closing_cash_expected:
            closedShift.closing_cash_expected,
          closing_cash_declared:
            closedShift.closing_cash_declared,
          closing_cash_variance:
            closedShift.closing_cash_variance,
          closing_cash_actual:
            closedShift.closing_cash_actual,
          variance: closedShift.variance,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });

      return closedShift;
    });

    const threshold = await getVarianceThreshold();

    const flagged =
      Math.abs(closed.variance) >= threshold;

    res.json({ success: true, data: { ...closed, flagged, threshold } });
  } catch (error) {
    logger.error('Close shift error:', error);

    if (error.statusCode === 422) {
      return res.status(422).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to close shift',
    });
  }
};

exports.listShifts = async (req, res) => {
  const { agent_id, branch_id, flagged_only, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const threshold = await getVarianceThreshold();

    const conditions = [`status = 'closed'`];
    const params = [];
    let idx = 1;

    if (req.user.role !== 'superuser') {
      conditions.push(`company_id = $${idx++}`);
      params.push(req.user.company_id);
    }
    if (agent_id) { conditions.push(`agent_id = $${idx++}`); params.push(agent_id); }
    if (branch_id) { conditions.push(`branch_id = $${idx++}`); params.push(branch_id); }
    if (flagged_only === 'true') {
      conditions.push(`ABS(variance) >= $${idx++}`);
      params.push(threshold);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [data, count] = await Promise.all([
      query(
        `SELECT s.*, u.first_name, u.last_name, b.name as branch_name
         FROM shifts s
         JOIN users u ON u.id = s.agent_id
         LEFT JOIN branches b ON b.id = s.branch_id
         ${where}
         ORDER BY s.closed_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(`SELECT COUNT(*) FROM shifts s ${where}`, params),
    ]);

    res.json({
      success: true,
      data: data.rows.map(r => ({ ...r, flagged: Math.abs(r.variance) >= threshold })),
      meta: { total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit), threshold },
    });
  } catch (error) {
    logger.error('List shifts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shifts' });
  }
};
