-- Adds a config-driven kill-switch / feature-flag mechanism: an admin
-- can disable any provider+transaction_type combo (format
-- "provider:transaction_type" in a JSON array) without an app
-- release. Enforced both client-side (app greys out the tile) and
-- server-side (transaction creation rejects it, so even a stale app
-- build that doesn't check the flag can't bypass it).
INSERT INTO system_config (key, value, description)
SELECT 'disabled_transaction_types', '[]',
  'JSON array of "provider:transaction_type" strings currently disabled app-wide (e.g. ["telecel:cash_out"]). Checked by both the app (tile greys out) and the server (transaction creation rejected).'
WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'disabled_transaction_types');
