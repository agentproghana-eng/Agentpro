-- Float Received is a real financial event:
-- an agent declares e-Float acquired externally from a super-agent.
--
-- It is distinct from customer Cash In and from branch float funding.
-- Recording it as its own canonical transaction makes the e-Float
-- increase visible in Transaction History and reconcilable to the
-- exact SIM wallet without falsifying another transaction type.
--
-- Keep this migration enum-only. The migration runner wraps each
-- migration in its own transaction, and PostgreSQL enum additions
-- must commit before the new value is safely used elsewhere.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'float_received';
