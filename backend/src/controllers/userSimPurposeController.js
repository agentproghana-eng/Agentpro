const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");

const CANONICAL_PURPOSES = ["agent", "subscriber", "evd", "merchant"];

const VALID_PROVIDERS = ["mtn", "telecel", "at_money"];

const PURPOSES_BY_PROVIDER = {
  mtn: new Set(["agent", "subscriber", "evd", "merchant"]),
  telecel: new Set(["agent", "subscriber", "merchant"]),
  at_money: new Set(["agent", "subscriber", "merchant"]),
};

const normalizePurpose = (purpose) => {
  if (purpose === "personal") {
    return "subscriber";
  }

  return purpose;
};

const validateAssignment = (assignment) => {
  if (
    !assignment ||
    typeof assignment.sim_slot !== "number" ||
    !Number.isInteger(assignment.sim_slot) ||
    assignment.sim_slot < 0
  ) {
    return "Each assignment needs a non-negative integer sim_slot.";
  }

  const purpose = normalizePurpose(assignment.purpose);

  if (!CANONICAL_PURPOSES.includes(purpose)) {
    return (
      "Each assignment needs a valid purpose " +
      "(agent/subscriber/evd/merchant)."
    );
  }

  const provider = assignment.provider;

  if (provider !== undefined && provider !== null && provider !== "") {
    if (!VALID_PROVIDERS.includes(provider)) {
      return "Each SIM assignment must use a supported provider.";
    }

    if (!PURPOSES_BY_PROVIDER[provider].has(purpose)) {
      return `${purpose} is not supported for provider ${provider}.`;
    }
  }

  return null;
};

// ─── List My SIM Purpose Assignments ───────────────────────────
//
// SIM Purpose now identifies the operational role of each physical SIM:
// Agent, Subscriber, Merchant and, for MTN, EVD.
//
// The endpoint remains self-scoped to req.user.id.
exports.listPurposes = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         sim_slot,
         sim_iccid,
         provider,
         CASE
           WHEN purpose::text = 'personal'
             THEN 'subscriber'
           ELSE purpose::text
         END AS purpose,
         updated_at
       FROM user_sim_purposes
       WHERE user_id = $1
       ORDER BY sim_slot`,
      [req.user.id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error("List SIM purposes error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch SIM purpose assignments",
    });
  }
};

// ─── Set/Update SIM Purpose Assignments ────────────────────────
//
// Accepts:
//
// {
//   sim_slot,
//   sim_iccid,
//   provider,
//   purpose
// }
//
// Legacy purpose "personal" is normalized to "subscriber" during rollout.
exports.setPurposes = async (req, res) => {
  const { assignments } = req.body;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(422).json({
      success: false,
      message: "assignments array is required",
    });
  }

  for (const assignment of assignments) {
    const validationError = validateAssignment(assignment);

    if (validationError) {
      return res.status(422).json({
        success: false,
        message: validationError,
      });
    }
  }

  try {
    await withTransaction(async (client) => {
      for (const assignment of assignments) {
        const purpose = normalizePurpose(assignment.purpose);

        const provider = assignment.provider || null;

        await client.query(
          `INSERT INTO user_sim_purposes (
             user_id,
             sim_slot,
             sim_iccid,
             provider,
             purpose
           )
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, sim_slot)
           DO UPDATE SET
             sim_iccid = EXCLUDED.sim_iccid,
             provider = EXCLUDED.provider,
             purpose = EXCLUDED.purpose,
             updated_at = NOW()`,
          [
            req.user.id,
            assignment.sim_slot,
            assignment.sim_iccid || null,
            provider,
            purpose,
          ],
        );
      }
    });

    const result = await query(
      `SELECT
         sim_slot,
         sim_iccid,
         provider,
         CASE
           WHEN purpose::text = 'personal'
             THEN 'subscriber'
           ELSE purpose::text
         END AS purpose,
         updated_at
       FROM user_sim_purposes
       WHERE user_id = $1
       ORDER BY sim_slot`,
      [req.user.id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error("Set SIM purposes error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to save SIM purpose assignments",
    });
  }
};

exports._test = {
  normalizePurpose,
  validateAssignment,
};
