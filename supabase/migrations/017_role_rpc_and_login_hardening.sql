-- ============================================================================
-- 017_role_rpc_and_login_hardening.sql
-- C2, C3: Guarded admin_set_user_role RPC & direct role UPDATE prohibition
-- H1: Revoke anon execution on get_email_for_username (Edge Function only)
-- ============================================================================

-- 1. Revoke public/anon execute on get_email_for_username
REVOKE EXECUTE ON FUNCTION get_email_for_username(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_for_username(TEXT) TO service_role;

-- 2. Create guarded admin_set_user_role procedure
CREATE OR REPLACE FUNCTION admin_set_user_role(p_user_id UUID, p_new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current_role TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  IF p_new_role NOT IN ('admin', 'recipe_creator', 'user') THEN
    RAISE EXCEPTION 'Invalid user role specified: %', p_new_role;
  END IF;

  SELECT role INTO v_current_role FROM profiles WHERE id = p_user_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- Guard: Prevent admin from demoting self
  IF p_user_id = auth.uid() AND p_new_role <> 'admin' THEN
    RAISE EXCEPTION 'Administrators cannot demote their own accounts.';
  END IF;

  -- Guard: Prevent non-admin caller from promoting self (defense in depth)
  IF p_user_id = auth.uid() AND v_current_role <> 'admin' THEN
    RAISE EXCEPTION 'Users cannot modify their own roles.';
  END IF;

  -- Guard: Prevent demoting the last active administrator
  IF v_current_role = 'admin' AND p_new_role <> 'admin' THEN
    IF count_active_admins() <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last active administrator.';
    END IF;
  END IF;

  -- Set session configuration flag to allow trigger to permit role change
  PERFORM set_config('app.allow_role_change', 'true', true);

  UPDATE profiles
  SET role = p_new_role,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_user_role(UUID, TEXT) TO authenticated;

-- 3. Update approve_creator_application to allow role change through trigger
CREATE OR REPLACE FUNCTION approve_creator_application(app_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  applicant_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  SELECT user_id INTO applicant_id FROM creator_applications WHERE id = app_id;
  IF applicant_id IS NULL THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;

  UPDATE creator_applications
  SET status = 'approved', reviewed_at = now()
  WHERE id = app_id;

  -- Set session configuration flag for trigger
  PERFORM set_config('app.allow_role_change', 'true', true);

  -- Only upgrade non-admin profiles to recipe_creator
  UPDATE profiles
  SET role = 'recipe_creator', updated_at = now()
  WHERE id = applicant_id AND role <> 'admin';
END;
$$;

GRANT EXECUTE ON FUNCTION approve_creator_application(UUID) TO authenticated;

-- 4. Harden prevent_unauthorized_role_change trigger to block direct role modifications
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

  -- Role escalation / demotion guard: MUST go through admin_set_user_role or approve_creator_application
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;

    IF current_setting('app.allow_role_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct updates to user roles are prohibited. Use admin_set_user_role procedure.';
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

  RETURN NEW;
END;
$$;
