-- 009_security_hardening.sql
-- Backend Cloud and Security Hardening Migration
-- Enforces RLS escalation prevention, lifecycle tamper-resistance, PII protection, and recipe detail moderation.

-- 1. Ensure SECURITY DEFINER helpers exist with explicit search path
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Prevent role escalation and protected metadata tampering on INSERT and UPDATE
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  -- Handle INSERT: Force non-admin inserts to standard defaults
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin() THEN
      NEW.role := 'user';
      NEW.is_archived := false;
      NEW.scheduled_delete_at := NULL;
      NEW.username_last_changed_at := NULL;
      NEW.display_name_last_changed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle UPDATE:
  -- Role escalation guard
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;
  END IF;

  -- Account archiving guard
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can archive user accounts.';
    END IF;
  END IF;

  -- Account scheduled deletion guard (must use dedicated RPC or admin)
  IF NEW.scheduled_delete_at IS DISTINCT FROM OLD.scheduled_delete_at THEN
    IF NOT is_admin() AND current_setting('app.allow_account_deletion', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Only administrators or dedicated lifecycle procedures can modify scheduled deletion.';
    END IF;
  END IF;

  -- Cooldown timestamp protection against manual reset
  IF NEW.username_last_changed_at IS DISTINCT FROM OLD.username_last_changed_at THEN
    IF NOT is_admin() AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'Cannot modify username cooldown timestamp directly.';
    END IF;
  END IF;

  IF NEW.display_name_last_changed_at IS DISTINCT FROM OLD.display_name_last_changed_at THEN
    IF NOT is_admin() AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN
      RAISE EXCEPTION 'Cannot modify display name cooldown timestamp directly.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger to cover both INSERT and UPDATE
DROP TRIGGER IF EXISTS prevent_role_escalation ON profiles;
CREATE TRIGGER prevent_role_escalation
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_unauthorized_role_change();

-- 3. Dedicated secure procedures for account deletion lifecycle
CREATE OR REPLACE FUNCTION schedule_account_deletion()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.allow_account_deletion', 'true', true);

  UPDATE profiles
  SET scheduled_delete_at = now() + INTERVAL '30 days',
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.allow_account_deletion', 'true', true);

  UPDATE profiles
  SET scheduled_delete_at = NULL,
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION schedule_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_account_deletion() TO authenticated;

-- 4. Harden profiles INSERT RLS policy
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND (
      is_admin()
      OR (
        role = 'user'
        AND is_archived = false
        AND scheduled_delete_at IS NULL
      )
    )
  );

-- 5. Revoke anon execution on get_email_for_username to eliminate email harvesting
REVOKE EXECUTE ON FUNCTION get_email_for_username(TEXT) FROM anon, public;

-- 6. Harden recipe_details UPDATE policy to prevent unmoderated changes to approved recipes
DROP POLICY IF EXISTS "Details updatable by recipe owner or admin" ON recipe_details;
CREATE POLICY "Details updatable by recipe owner or admin"
  ON recipe_details FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          is_admin()
          OR (
            recipes.owner_id = auth.uid()
            AND recipes.status = 'pending'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          is_admin()
          OR (
            recipes.owner_id = auth.uid()
            AND recipes.status = 'pending'
          )
        )
    )
  );

-- 7. Add partial unique index on creator_applications to prevent queue flooding / DoS
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_creator_application_per_user
  ON creator_applications (user_id)
  WHERE status = 'pending';
