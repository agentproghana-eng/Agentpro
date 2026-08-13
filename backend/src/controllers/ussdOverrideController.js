const { query } = require("../config/database");
const { logger } = require("../utils/logger");

// List the active legacy single-dial combinations that may actually
// receive a per-user override. This intentionally comes from persisted
// active templates rather than a provider/type allowlist, so newly
// registered providers and transaction types become available without
// another application-code change.
exports.listCapabilities = async (req, res) => {
  try {
    const result = await query(
      `SELECT provider, transaction_type, name
       FROM ussd_templates
       WHERE is_active = TRUE
         AND ussd_string_pattern IS NOT NULL
       ORDER BY provider, transaction_type`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error("List USSD override capabilities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch USSD override capabilities",
    });
  }
};

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
    return res.status(422).json({
      success: false,
      message: "Pattern must start with * and end with #",
    });
  }

  // Same PIN-safety boundary as the global legacy template editor:
  // a user may customize a single-dial pattern, but the application
  // must never accept a PIN placeholder into a dial string.
  if (/\{pin\}/i.test(pattern)) {
    return res.status(422).json({
      success: false,
      message:
        "USSD patterns must never contain a {pin} placeholder. " +
        "PIN entry is always handled on the network screen.",
    });
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
    if (error.code === '22P02') {
      return res.status(422).json({
        success: false,
        code: 'USSD_SCHEMA_VALUE_NOT_REGISTERED',
        message: 'Provider or transaction type is not registered in the database schema yet. Add the new value through a database migration before creating this USSD configuration.',
      });
    }
    logger.error("Save USSD override error:", error);
    res.status(500).json({ success: false, message: "Failed to save USSD override" });
  }
};

// Reset this Business user's legacy override so the centrally managed
// template pattern is used again.
exports.deleteOverride = async (req, res) => {
  const { override_id } = req.params;
  try {
    const result = await query(
      `DELETE FROM agent_ussd_overrides
       WHERE id = $1 AND agent_id = $2
       RETURNING id`,
      [override_id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "USSD override not found",
      });
    }

    res.json({ success: true, message: "USSD override reset" });
  } catch (error) {
    logger.error("Delete USSD override error:", error);
    res.status(500).json({ success: false, message: "Failed to reset USSD pattern" });
  }
};
