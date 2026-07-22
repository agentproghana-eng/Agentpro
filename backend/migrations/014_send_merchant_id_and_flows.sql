-- Adds send_merchant_id as its own Flow Builder action, distinct from
-- send_reference - Pay to Merchant needs both a Merchant ID and a
-- separate free-text Reference sent at different steps, confirmed via
-- live device mapping earlier this session.
ALTER TYPE ussd_flow_action ADD VALUE IF NOT EXISTS 'send_merchant_id';
