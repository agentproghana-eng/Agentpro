const { query } = require("../config/database");
const { logger } = require("../utils/logger");

// List the requesting agent's own USSD overrides.
exports.listOverrides = async (req, res) => {
  try {
    const result = await query(
      "SELECT id, provider, transaction_type, ussd_string_pattern FROM agent_ussd_overrides WHERE agent_id = $1",
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List USSD overrides error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch USSD overrides" });
  }
};

// Save (create or update) an override for a provider + transaction type.
// Basic format validation only - the real PIN safety guarantee comes
// from the app never having a PIN field anywhere, not from this check.
exports.saveOverride = async (req, res) => {
  const { provider, transaction_type, ussd_string_pattern } = req.body;
  const pattern = (ussd_string_pattern || "").trim();

  if (!pattern.startsWith("*") || !pattern.endsWith("#")) {
    return res.status(422).json({ success: false, message: "Pattern must start with * and end with #" });
  }

  try {
    const result = await query(
      `INSERT INTO agent_ussd_overrides (agent_id, provider, transaction_type, ussd_string_pattern)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, provider, transaction_type)
       DO UPDATE SET ussd_string_pattern = $4, updated_at = NOW()
       RETURNING id, provider, transaction_type, ussd_string_pattern`,
      [req.user.id, provider, transaction_type, pattern]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Save USSD override error:", error);
    res.status(500).json({ success: false, message: "Failed to save USSD override" });
  }
};

// Reset to the company default by deleting the agent's own override.
exports.deleteOverride = async (req, res) => {
  const { override_id } = req.params;
  try {
    await query(
      "DELETE FROM agent_ussd_overrides WHERE id = $1 AND agent_id = $2",
      [override_id, req.user.id]
    );
    res.json({ success: true, message: "Reset to company default" });
  } catch (error) {
    logger.error("Delete USSD override error:", error);
    res.status(500).json({ success: false, message: "Failed to reset USSD pattern" });
  }
};
