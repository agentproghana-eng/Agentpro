-- The Telecel Data Bundle seed in migration 036 uses send_selection.
-- Add the enum value immediately before that seed so fresh databases
-- can apply the migration history from start to finish successfully.
--
-- IF NOT EXISTS also makes this safe for existing databases where the
-- value may already have been introduced manually or by a later schema
-- alignment migration.

ALTER TYPE ussd_flow_action
  ADD VALUE IF NOT EXISTS 'send_selection';
