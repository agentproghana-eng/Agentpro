-- Additive delegated Admin Portal roles.
-- users.role remains the primary application/business role.

CREATE TABLE IF NOT EXISTS user_admin_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role),
  CONSTRAINT user_admin_roles_delegated_only CHECK (
    role IN (
      'admin_support'::user_role,
      'admin_operations'::user_role,
      'admin_finance'::user_role,
      'admin_content'::user_role
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_admin_roles_role_user
  ON user_admin_roles(role, user_id);

-- Preserve delegated admins introduced by migration 142.
INSERT INTO user_admin_roles (user_id, role, granted_by)
SELECT id, role, NULL
FROM users
WHERE role IN (
  'admin_support'::user_role,
  'admin_operations'::user_role,
  'admin_finance'::user_role,
  'admin_content'::user_role
)
ON CONFLICT (user_id, role) DO NOTHING;

-- New legacy-style delegated admin accounts created through POST /users
-- automatically get a canonical membership too.
CREATE OR REPLACE FUNCTION sync_primary_admin_role_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN (
    'admin_support'::user_role,
    'admin_operations'::user_role,
    'admin_finance'::user_role,
    'admin_content'::user_role
  ) THEN
    INSERT INTO user_admin_roles (
      user_id,
      role,
      granted_by
    )
    VALUES (
      NEW.id,
      NEW.role,
      NULL
    )
    ON CONFLICT (user_id, role)
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_sync_primary_admin_role
ON users;

CREATE TRIGGER trg_users_sync_primary_admin_role
AFTER INSERT OR UPDATE OF role
ON users
FOR EACH ROW
EXECUTE FUNCTION sync_primary_admin_role_membership();
