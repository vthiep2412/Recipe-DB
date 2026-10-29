-- ============================================================================
-- 012_rbac_self_lockout_guards.sql
-- RBAC Hardening: Prevent Admin Self-Lockout & Enforce Minimum Active Admin Invariant
-- ============================================================================

-- 1. Helper to count currently active, unarchived, non-deleted administrators
CREATE OR REPLACE FUNCTION count_active_admins()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT count(*)::integer
  FROM profiles
  WHERE role = 'admin'
    AND is_archived = false
    AND is_admin_deleted = false
    AND (scheduled_delete_at IS NULL OR scheduled_delete_at > now());
$$;

GRANT EXECUTE ON FUNCTION count_active_admins() TO anon, authenticated;

-- 2. Harden admin_set_user_archived against self-archiving and last-admin archiving
CREATE OR REPLACE FUNCTION admin_set_user_archived(p_user_id UUID, p_is_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- Guard: Prevent admin from archiving/banning self
  IF p_user_id = auth.uid() AND p_is_archived IS TRUE THEN
    RAISE EXCEPTION 'Administrators cannot archive or ban their own accounts.';
  END IF;

  -- Guard: Prevent archiving the last active admin
  IF p_is_archived IS TRUE AND (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' THEN
    IF count_active_admins() <= 1 THEN
      RAISE EXCEPTION 'Cannot archive the last active administrator.';
    END IF;
  END IF;

  UPDATE profiles
  SET is_archived = p_is_archived,
      updated_at = now()
  WHERE id = p_user_id;

  IF p_is_archived IS TRUE THEN
    PERFORM revoke_user_sessions_and_ban(p_user_id);
  ELSE
    UPDATE auth.users SET banned_until = NULL WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_user_archived(UUID, BOOLEAN) TO authenticated;

-- 3. Harden admin_schedule_account_deletion against self-deletion and last-admin deletion
CREATE OR REPLACE FUNCTION admin_schedule_account_deletion(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can schedule account deletion for users.';
  END IF;

  -- Guard: Prevent admin from scheduling deletion for self
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot schedule deletion of their own accounts.';
  END IF;

  -- Guard: Prevent scheduling deletion for the last active admin
  IF (SELECT role FROM profiles WHERE id = target_user_id) = 'admin' THEN
    IF count_active_admins() <= 1 THEN
      RAISE EXCEPTION 'Cannot schedule deletion of the last active administrator.';
    END IF;
  END IF;

  PERFORM set_config('app.allow_account_deletion', 'true', true);

  UPDATE profiles
  SET scheduled_delete_at = now() + INTERVAL '30 days',
      is_admin_deleted = true,
      updated_at = now()
  WHERE id = target_user_id;

  PERFORM revoke_user_sessions_and_ban(target_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_schedule_account_deletion(UUID) TO authenticated;

-- 4. Harden admin_delete_user against self-deletion and last-admin deletion
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- Guard: Prevent admin from deleting self
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot delete their own accounts via admin procedure.';
  END IF;

  -- Guard: Prevent deleting the last active admin
  IF (SELECT role FROM profiles WHERE id = target_user_id) = 'admin' THEN
    IF count_active_admins() <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last active administrator.';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;

-- 5. Update prevent_unauthorized_role_change trigger to enforce admin invariants
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Handle INSERT: Force non-admin inserts to standard defaults
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin() THEN
      NEW.role := 'user';
      NEW.is_archived := false;
      NEW.scheduled_delete_at := NULL;
      NEW.is_admin_deleted := false;
      NEW.username_last_changed_at := NULL;
      NEW.display_name_last_changed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle UPDATE:
  -- Block non-admin updates if account is archived or admin-deleted
  IF NOT is_admin() AND (OLD.is_archived = true OR OLD.is_admin_deleted = true) THEN
    RAISE EXCEPTION 'Account is suspended or marked for deletion. Profile updates prohibited.';
  END IF;

  -- Role escalation / demotion guard
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;

    -- Guard: Prevent demoting the last active administrator
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      IF count_active_admins() <= 1 THEN
        RAISE EXCEPTION 'Cannot demote the last active administrator.';
      END IF;
    END IF;
  END IF;

  -- Account archiving guard
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can archive user accounts.';
    END IF;

    IF NEW.is_archived IS TRUE THEN
      IF OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Administrators cannot archive their own accounts.';
      END IF;
      IF OLD.role = 'admin' AND count_active_admins() <= 1 THEN
        RAISE EXCEPTION 'Cannot archive the last active administrator.';
      END IF;
    END IF;
  END IF;

  -- Admin deletion guard
  IF NEW.is_admin_deleted IS DISTINCT FROM OLD.is_admin_deleted THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can mark accounts as admin-deleted.';
    END IF;

    IF NEW.is_admin_deleted IS TRUE THEN
      IF OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Administrators cannot mark their own accounts as admin-deleted.';
      END IF;
      IF OLD.role = 'admin' AND count_active_admins() <= 1 THEN
        RAISE EXCEPTION 'Cannot mark the last active administrator as admin-deleted.';
      END IF;
    END IF;
  END IF;

  -- Account scheduled deletion guard (must use dedicated RPC or admin)
  IF NEW.scheduled_delete_at IS DISTINCT FROM OLD.scheduled_delete_at THEN
    IF NOT is_admin() AND current_setting('app.allow_account_deletion', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Only administrators or dedicated lifecycle procedures can modify scheduled deletion.';
    END IF;

    IF NEW.scheduled_delete_at IS NOT NULL AND (OLD.scheduled_delete_at IS NULL OR NEW.scheduled_delete_at <> OLD.scheduled_delete_at) THEN
      IF OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Administrators cannot schedule deletion of their own accounts.';
      END IF;
      IF OLD.role = 'admin' AND count_active_admins() <= 1 THEN
        RAISE EXCEPTION 'Cannot schedule deletion of the last active administrator.';
      END IF;
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

-- 6. Harden profiles DELETE RLS policy against self-deletion and last-admin deletion
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    is_admin()
    AND id <> auth.uid()
    AND (
      role <> 'admin'
      OR count_active_admins() > 1
    )
  );
