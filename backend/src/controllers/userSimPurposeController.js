const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');

const VALID_PURPOSES = ['agent', 'personal'];

// ─── List My SIM Purpose Assignments ───────────────────────────
// Only meaningful for a user holding both Business and Personal
// capability at once - SimCardService only identifies which network a
// SIM is on, not which "hat" it's for. This endpoint itself doesn't
// gate on holding both capabilities (harmless either way, and every
// feature that actually consumes this data already enforces its own
// real gate) - it's just self-scoped descriptive data.

exports.listPurposes = async (req, res) => {
  try {
    const result = await query(
      'SELECT sim_slot, sim_iccid, purpose, updated_at FROM user_sim_purposes WHERE user_id = $1 ORDER BY sim_slot',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List SIM purposes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SIM purpose assignments' });
  }
};

// ─── Set/Update SIM Purpose Assignments ────────────────────────
// Accepts an array of { sim_slot, sim_iccid, purpose } and upserts
// each one against (user_id, sim_slot).

exports.setPurposes = async (req, res) => {
  const { assignments } = req.body;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(422).json({ success: false, message: 'assignments array is required' });
  }

  for (const a of assignments) {
    if (typeof a.sim_slot !== 'number' || !VALID_PURPOSES.includes(a.purpose)) {
      return res.status(422).json({ success: false, message: 'Each assignment needs a numeric sim_slot and a valid purpose (agent/personal)' });
    }
  }

  try {
    await withTransaction(async (client) => {
      for (const a of assignments) {
        await client.query(
          `INSERT INTO user_sim_purposes (user_id, sim_slot, sim_iccid, purpose)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, sim_slot)
           DO UPDATE SET sim_iccid = $3, purpose = $4, updated_at = NOW()`,
          [req.user.id, a.sim_slot, a.sim_iccid || null, a.purpose]
        );
      }
    });

    const result = await query(
      'SELECT sim_slot, sim_iccid, purpose, updated_at FROM user_sim_purposes WHERE user_id = $1 ORDER BY sim_slot',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Set SIM purposes error:', error);
    res.status(500).json({ success: false, message: 'Failed to save SIM purpose assignments' });
  }
};
