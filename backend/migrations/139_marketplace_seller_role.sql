-- Marketplace-only seller identity.
--
-- Marketplace self-registration must never grant an AgentPro
-- Mobile Money role.

ALTER TYPE user_role
ADD VALUE IF NOT EXISTS 'marketplace_seller';
