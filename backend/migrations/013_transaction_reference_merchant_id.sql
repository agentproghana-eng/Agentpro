-- Adds payment_reference and merchant_id columns to transactions -
-- needed by Pay to Agent (Reference) and Pay to Merchant (Merchant
-- ID + Reference), confirmed via live device mapping tonight. These
-- were being collected by the app's forms and sent to the backend,
-- but silently dropped since neither the transactions table nor the
-- initiateTransaction controller captured them.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(50);
