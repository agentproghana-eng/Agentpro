-- Give MTN Agent Pay to Agent its own canonical transaction type.
--
-- Historically AgentPro reused bill_payment for MTN Pay to Agent.
-- That semantic shortcut is retired here so bill_payment remains
-- available for a genuine Bill Payment feature in the future.
--
-- Renaming the enum value preserves all existing enum-backed rows,
-- foreign relationships, flow IDs, capabilities, and audit history.

ALTER TYPE transaction_type
  RENAME VALUE 'bill_payment'
  TO 'pay_to_agent';

-- Reserve the original semantic name for the future genuine
-- Bill Payment product. No capability is created for it here,
-- so it remains non-initiable until that feature is implemented.

ALTER TYPE transaction_type
  ADD VALUE 'bill_payment'
  AFTER 'pay_to_agent';
