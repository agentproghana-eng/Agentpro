-- Adds three new transaction types for MTN's real "My Wallet >
-- Commissions" menu (confirmed via live device mapping): checking the
-- commission balance itself, viewing cash-in commission specifically,
-- and transferring commission to the wallet. These replace the app's
-- old "Check Balance" quick action (which dialed a generic wallet
-- balance) with an explicit 2-way choice between the two balance
-- checks that actually matter to an agent day to day.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'commission_balance';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_in_commission';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'commission_transfer';

-- Adds the ability for a Flow Builder step to send a per-transaction
-- free-text reference (e.g. Pay to Agent/Merchant's "Enter Reference"
-- screen) - the existing send_literal action only supports a fixed
-- string baked into the step itself, which can't vary per transaction.
ALTER TYPE ussd_flow_action ADD VALUE IF NOT EXISTS 'send_reference';
