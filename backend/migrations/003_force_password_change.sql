-- Add a flag to force a password change on next login for staff
-- accounts created by a business owner with an auto-generated
-- temporary password. Self-registered business owners set their own
-- password from the start, so this defaults to FALSE for everyone.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
