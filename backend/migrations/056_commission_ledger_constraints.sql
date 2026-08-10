-- Commission ledger integrity constraints.
--
-- Migration 055 must commit first so 'commission_earned' is available for
-- use in the partial index below.

-- There must never be more than one commission calculation for the same
-- transaction. Do not silently delete legacy duplicates: those represent
-- financial records that require explicit reconciliation.
DO $$
BEGIN
  IF EXISTS (
    SELECT transaction_id
    FROM commissions
    GROUP BY transaction_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce commission uniqueness: duplicate transaction_id values exist in commissions';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_commissions_transaction_unique
ON commissions(transaction_id);

-- A transaction may credit earned commission to the agent balance at most
-- once. This is defense in depth in addition to the transaction completion
-- row lock.
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_agent_balance_movements_commission_earned_transaction
ON agent_balance_movements(transaction_id)
WHERE movement_type = 'commission_earned';
