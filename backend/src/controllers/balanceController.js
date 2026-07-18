const { query, withTransaction } = require("../config/database");
const { auditLog } = require("../services/auditService");
const { logger } = require("../utils/logger");

// Get or create the agent's balance row for a given provider.
// Must be called with an active transaction client.
async function getOrCreateAgentBalance(client, agentId, provider) {
  let result = await client.query(
    "SELECT * FROM agent_balances WHERE agent_id = $1 AND provider = $2",
    [agentId, provider]
  );
  if (result.rows.length === 0) {
    result = await client.query(
      "INSERT INTO agent_balances (agent_id, provider) VALUES ($1, $2) RETURNING *",
      [agentId, provider]
    );
  }
  return result.rows[0];
}

// Fetch an agent's balances across all providers. Owners/managers can
// view any agent in their company; agents can only view their own.
exports.getAgentBalances = async (req, res) => {
  const targetAgentId = req.params.agent_id || req.user.id;

  try {
    if (targetAgentId !== req.user.id && !["superuser", "business_owner", "manager"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const result = await query(
      "SELECT provider, e_float_balance, cash_at_hand, commission_balance, last_updated_at FROM agent_balances WHERE agent_id = $1",
      [targetAgentId]
    );

    const existingByProvider = {};
    result.rows.forEach((row) => { existingByProvider[row.provider] = row; });

    const allProviders = ["mtn", "telecel", "at_money"];
    const data = allProviders.map((provider) => existingByProvider[provider] || {
      provider,
      e_float_balance: "0.00",
      cash_at_hand: "0.00",
      commission_balance: "0.00",
      last_updated_at: null,
    });

    res.json({ success: true, data: data });
  } catch (error) {
    logger.error("Get agent balances error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch balances" });
  }
};

// Manual Cash Out for providers where e-cash moves directly SIM-to-SIM
// (Telecel, AirtelTigo) and cannot be captured by USSD automation. The
// agent enters the cash they handed over; e-Float goes UP by that
// amount (the customer's e-cash just arrived), Cash at Hand goes DOWN
// by the same amount (that cash just left the agent's hand).
exports.recordCashOutManual = async (req, res) => {
  const { provider, amount, reference, notes } = req.body;
  const agentId = req.user.id;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(422).json({ success: false, message: "A valid amount is required" });
  }

  try {
    await withTransaction(async (client) => {
      const balance = await getOrCreateAgentBalance(client, agentId, provider);
      const amt = parseFloat(amount);

      const eFloatBefore = parseFloat(balance.e_float_balance);
      const eFloatAfter = eFloatBefore + amt;
      const cashBefore = parseFloat(balance.cash_at_hand);
      const cashAfter = cashBefore - amt;

      await client.query(
        "UPDATE agent_balances SET e_float_balance = $1, cash_at_hand = $2, last_updated_at = NOW() WHERE id = $3",
        [eFloatAfter, cashAfter, balance.id]
      );

      await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, reference, notes)
         VALUES ($1, $2, 'cash_out_manual', 'e_float', $3, $4, $5, $6, $7)`,
        [agentId, provider, amt, eFloatBefore, eFloatAfter, reference, notes]
      );
      await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, reference, notes)
         VALUES ($1, $2, 'cash_out_manual', 'cash_at_hand', $3, $4, $5, $6, $7)`,
        [agentId, provider, -amt, cashBefore, cashAfter, reference, notes]
      );
    });

    res.json({ success: true, message: "Cash Out recorded" });
  } catch (error) {
    logger.error("Manual cash out error:", error);
    res.status(500).json({ success: false, message: "Failed to record Cash Out" });
  }
};

// Agent self-declares e-float bought from a super-agent - a real
// event the app cannot otherwise observe.
exports.recordFloatReceived = async (req, res) => {
  const { provider, amount, reference, notes } = req.body;
  const agentId = req.user.id;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(422).json({ success: false, message: "A valid amount is required" });
  }

  try {
    await withTransaction(async (client) => {
      const balance = await getOrCreateAgentBalance(client, agentId, provider);
      const amt = parseFloat(amount);
      const before = parseFloat(balance.e_float_balance);
      const after = before + amt;

      await client.query(
        "UPDATE agent_balances SET e_float_balance = $1, last_updated_at = NOW() WHERE id = $2",
        [after, balance.id]
      );

      await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, reference, notes)
         VALUES ($1, $2, 'float_received', 'e_float', $3, $4, $5, $6, $7)`,
        [agentId, provider, amt, before, after, reference, notes]
      );
    });

    res.json({ success: true, message: "Float received recorded" });
  } catch (error) {
    logger.error("Float received error:", error);
    res.status(500).json({ success: false, message: "Failed to record float received" });
  }
};

// Records the app-initiated USSD dial that moves accrued commission
// into e-Float. Unlike customer-initiated transfers, this one genuinely
// can be auto-recorded, since the agent dials it through the app.
exports.recordCommissionTransfer = async (req, res) => {
  const { provider, amount, reference } = req.body;
  const agentId = req.user.id;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(422).json({ success: false, message: "A valid amount is required" });
  }

  try {
    await withTransaction(async (client) => {
      const balance = await getOrCreateAgentBalance(client, agentId, provider);
      const amt = parseFloat(amount);

      const commissionBefore = parseFloat(balance.commission_balance);
      if (amt > commissionBefore) {
        throw { statusCode: 400, message: "Amount exceeds available commission" };
      }
      const commissionAfter = commissionBefore - amt;
      const eFloatBefore = parseFloat(balance.e_float_balance);
      const eFloatAfter = eFloatBefore + amt;

      await client.query(
        "UPDATE agent_balances SET commission_balance = $1, e_float_balance = $2, last_updated_at = NOW() WHERE id = $3",
        [commissionAfter, eFloatAfter, balance.id]
      );

      await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, reference)
         VALUES ($1, $2, 'commission_transfer', 'commission', $3, $4, $5, $6)`,
        [agentId, provider, -amt, commissionBefore, commissionAfter, reference]
      );
      await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, reference)
         VALUES ($1, $2, 'commission_transfer', 'e_float', $3, $4, $5, $6)`,
        [agentId, provider, amt, eFloatBefore, eFloatAfter, reference]
      );
    });

    res.json({ success: true, message: "Commission transferred to e-Float" });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error("Commission transfer error:", error);
    res.status(500).json({ success: false, message: "Failed to transfer commission" });
  }
};

// Cash at hand can be adjusted two ways:
// - "cash_set": agent states what cash at hand currently is - takes
//   effect immediately, no approval needed (routine self-report).
// - "cash_injection" / "cash_withdrawal": adding or removing real
//   money from the till - requires manager/owner approval before it
//   takes effect, since this is a bigger financial event.
exports.submitCashAdjustment = async (req, res) => {
  const { provider, adjustment_type, amount, reason } = req.body;
  const agentId = req.user.id;

  const validTypes = ["cash_set", "cash_injection", "cash_withdrawal"];
  if (!validTypes.includes(adjustment_type)) {
    return res.status(422).json({ success: false, message: "Invalid adjustment_type" });
  }
  if (amount === undefined || amount === null || parseFloat(amount) < 0) {
    return res.status(422).json({ success: false, message: "A valid amount is required" });
  }

  try {
    const result = await withTransaction(async (client) => {
      const balance = await getOrCreateAgentBalance(client, agentId, provider);
      const amt = parseFloat(amount);
      const cashBefore = parseFloat(balance.cash_at_hand);

      if (adjustment_type === "cash_set") {
        await client.query(
          "UPDATE agent_balances SET cash_at_hand = $1, last_updated_at = NOW() WHERE id = $2",
          [amt, balance.id]
        );
        await client.query(
          `INSERT INTO agent_balance_movements
           (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, notes, status)
           VALUES ($1, $2, 'cash_set', 'cash_at_hand', $3, $4, $5, $6, 'completed')`,
          [agentId, provider, amt - cashBefore, cashBefore, amt, reason]
        );
        return { immediate: true };
      }

      // Injection/withdrawal: log as pending, do NOT touch the balance yet
      const signedAmt = adjustment_type === "cash_withdrawal" ? -amt : amt;
      const movementResult = await client.query(
        `INSERT INTO agent_balance_movements
         (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, notes, status)
         VALUES ($1, $2, $3, 'cash_at_hand', $4, $5, $5, $6, 'pending') RETURNING id`,
        [agentId, provider, adjustment_type, signedAmt, cashBefore, reason]
      );
      return { immediate: false, movementId: movementResult.rows[0].id };
    });

    if (result.immediate) {
      return res.json({ success: true, message: "Cash at hand updated" });
    }
    res.status(201).json({ success: true, message: "Submitted for manager/owner approval", data: { movement_id: result.movementId } });
  } catch (error) {
    logger.error("Cash adjustment error:", error);
    res.status(500).json({ success: false, message: "Failed to submit cash adjustment" });
  }
};

// Manager/owner approves or rejects a pending cash injection or
// withdrawal. Only on approval does the balance actually change -
// rejecting leaves cash at hand untouched.
exports.reviewCashAdjustment = async (req, res) => {
  const { movement_id } = req.params;
  const { action, review_notes } = req.body;
  const reviewerId = req.user.id;

  if (!["approve", "reject"].includes(action)) {
    return res.status(422).json({ success: false, message: "action must be approve or reject" });
  }

  try {
    const movementResult = await query(
      "SELECT * FROM agent_balance_movements WHERE id = $1 AND status = $2",
      [movement_id, "pending"]
    );
    if (movementResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Pending adjustment not found" });
    }
    const movement = movementResult.rows[0];

    await withTransaction(async (client) => {
      if (action === "approve") {
        const balance = await getOrCreateAgentBalance(client, movement.agent_id, movement.provider);
        const cashBefore = parseFloat(balance.cash_at_hand);
        const cashAfter = cashBefore + parseFloat(movement.amount);

        await client.query(
          "UPDATE agent_balances SET cash_at_hand = $1, last_updated_at = NOW() WHERE id = $2",
          [cashAfter, balance.id]
        );
        await client.query(
          "UPDATE agent_balance_movements SET status = $1, balance_before = $2, balance_after = $3, reviewed_by = $4, reviewed_at = NOW(), review_notes = $5 WHERE id = $6",
          ["approved", cashBefore, cashAfter, reviewerId, review_notes, movement_id]
        );
      } else {
        await client.query(
          "UPDATE agent_balance_movements SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3 WHERE id = $4",
          ["rejected", reviewerId, review_notes, movement_id]
        );
      }
    });

    res.json({ success: true, message: `Adjustment ${action}d` });
  } catch (error) {
    logger.error("Review cash adjustment error:", error);
    res.status(500).json({ success: false, message: "Failed to review adjustment" });
  }
};

// List pending cash injections/withdrawals awaiting manager/owner review,
// scoped to the reviewer's own company.
exports.listPendingAdjustments = async (req, res) => {
  try {
    const result = await query(
      `SELECT abm.id, abm.agent_id, abm.provider, abm.movement_type, abm.amount,
              abm.notes, abm.created_at, u.first_name, u.last_name
       FROM agent_balance_movements abm
       JOIN users u ON u.id = abm.agent_id
       WHERE abm.status = $1 AND u.company_id = $2
       ORDER BY abm.created_at DESC`,
      ["pending", req.user.company_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List pending adjustments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending adjustments" });
  }
};
