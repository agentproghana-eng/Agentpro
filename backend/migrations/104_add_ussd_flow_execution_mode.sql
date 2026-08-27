ALTER TABLE ussd_flows
ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(16);

UPDATE ussd_flows
SET execution_mode = 'interactive'
WHERE execution_mode IS NULL;

ALTER TABLE ussd_flows
ALTER COLUMN execution_mode SET DEFAULT 'interactive';

ALTER TABLE ussd_flows
ALTER COLUMN execution_mode SET NOT NULL;

ALTER TABLE ussd_flows
DROP CONSTRAINT IF EXISTS ussd_flows_execution_mode_check;

ALTER TABLE ussd_flows
ADD CONSTRAINT ussd_flows_execution_mode_check
CHECK (execution_mode IN ('interactive', 'direct'));
