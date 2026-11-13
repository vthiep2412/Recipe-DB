-- ============================================================================
-- 011_security_defense_in_depth.sql
-- Comprehensive Backend RLS Hardening and Instant JWT/Session Revocation
-- ============================================================================

-- 1. Helper: Active Account Check (Checks archive, admin-deletion, and scheduled deletion)
CREATE OR REPLACE FUNCTION is_active_account(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND is_archived = false
      AND is_admin_deleted = false
      AND (scheduled_delete_at IS NULL OR scheduled_delete_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION is_active_account(UUID) TO anon, authenticated;

-- 2. Immediate Session & Auth Invalidation Helper
CREATE OR REPLACE FUNCTION revoke_user_sessions_and_ban(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Terminate all active sessions (kills refresh tokens)
  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  -- Block auth sign-in and token issuance in GoTrue
  UPDATE auth.users
  SET banned_until = now() + INTERVAL '99999 years'
  WHERE id = p_user_id;
END;
$$;

-- 3. Procedure for Admin to Archive & Immediately Revoke User
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

-- 4. Update Admin Schedule Account Deletion to Revoke Sessions Instantly
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

-- 5. Harden Profile Update Trigger Against Frozen Accounts
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

  -- Admin deletion guard
  IF NEW.is_admin_deleted IS DISTINCT FROM OLD.is_admin_deleted THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only administrators can mark accounts as admin-deleted.';
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

-- 6. Harden Recipes RLS Policies (Prevent Demotion & Tampering of Approved Recipes)
DROP POLICY IF EXISTS "Creators and admins can insert recipes" ON recipes;
CREATE POLICY "Creators and admins can insert recipes"
  ON recipes FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND is_active_account()
    AND (
      is_admin()
      OR (
        get_user_role() = 'recipe_creator'
        AND status = 'pending'
      )
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update recipes" ON recipes;
CREATE POLICY "Owners and admins can update recipes"
  ON recipes FOR UPDATE
  USING (
    is_admin()
    OR (
      auth.uid() = owner_id
      AND is_active_account()
      AND status = 'pending'  -- Cannot target approved recipes for creator updates
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = owner_id
      AND is_active_account()
      AND status = 'pending'
    )
  );

DROP POLICY IF EXISTS "Owners and admins can delete recipes" ON recipes;
CREATE POLICY "Owners and admins can delete recipes"
  ON recipes FOR DELETE
  USING (
    is_admin()
    OR (
      auth.uid() = owner_id
      AND is_active_account()
      AND status = 'pending'
    )
  );

-- Harden Recipe Details RLS Policies
DROP POLICY IF EXISTS "Details insertable by recipe owner or admin" ON recipe_details;
CREATE POLICY "Details insertable by recipe owner or admin"
  ON recipe_details FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          is_admin()
          OR (
            recipes.owner_id = auth.uid()
            AND is_active_account()
            AND recipes.status = 'pending'
          )
        )
    )
  );

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
            AND is_active_account()
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
            AND is_active_account()
            AND recipes.status = 'pending'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Details deletable by recipe owner or admin" ON recipe_details;
CREATE POLICY "Details deletable by recipe owner or admin"
  ON recipe_details FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          is_admin()
          OR (
            recipes.owner_id = auth.uid()
            AND is_active_account()
            AND recipes.status = 'pending'
          )
        )
    )
  );

-- 7. Add Length Constraints on User Data Tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_user_recipe_progress_id_len'
  ) THEN
    ALTER TABLE user_recipe_progress
      ADD CONSTRAINT check_user_recipe_progress_id_len CHECK (char_length(recipe_id) <= 128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_user_bookmarks_id_len'
  ) THEN
    ALTER TABLE user_bookmarks
      ADD CONSTRAINT check_user_bookmarks_id_len CHECK (char_length(recipe_id) <= 128);
  END IF;
END;
$$;

-- 8. Harden User Data Tables with is_active_account()
-- user_recipe_progress policies
DROP POLICY IF EXISTS "Users can view own recipe progress or admin" ON user_recipe_progress;
CREATE POLICY "Users can view own recipe progress or admin"
  ON user_recipe_progress FOR SELECT
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

DROP POLICY IF EXISTS "Users can insert own recipe progress" ON user_recipe_progress;
CREATE POLICY "Users can insert own recipe progress"
  ON user_recipe_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_active_account());

DROP POLICY IF EXISTS "Users can update own recipe progress" ON user_recipe_progress;
CREATE POLICY "Users can update own recipe progress"
  ON user_recipe_progress FOR UPDATE
  USING (auth.uid() = user_id AND is_active_account())
  WITH CHECK (auth.uid() = user_id AND is_active_account());

DROP POLICY IF EXISTS "Users can delete own recipe progress or admin" ON user_recipe_progress;
CREATE POLICY "Users can delete own recipe progress or admin"
  ON user_recipe_progress FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

-- user_settings policies
DROP POLICY IF EXISTS "Users can view own settings or admin" ON user_settings;
CREATE POLICY "Users can view own settings or admin"
  ON user_settings FOR SELECT
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_active_account());

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id AND is_active_account())
  WITH CHECK (auth.uid() = user_id AND is_active_account());

DROP POLICY IF EXISTS "Users can delete own settings or admin" ON user_settings;
CREATE POLICY "Users can delete own settings or admin"
  ON user_settings FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

-- user_bookmarks policies
DROP POLICY IF EXISTS "Users can view own bookmarks or admin" ON user_bookmarks;
CREATE POLICY "Users can view own bookmarks or admin"
  ON user_bookmarks FOR SELECT
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

DROP POLICY IF EXISTS "Users can insert own bookmarks" ON user_bookmarks;
CREATE POLICY "Users can insert own bookmarks"
  ON user_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_active_account());

DROP POLICY IF EXISTS "Users can delete own bookmarks or admin" ON user_bookmarks;
CREATE POLICY "Users can delete own bookmarks or admin"
  ON user_bookmarks FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_active_account()));

-- creator_applications policies
DROP POLICY IF EXISTS "Authenticated users can submit application" ON creator_applications;
CREATE POLICY "Authenticated users can submit application"
  ON creator_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_active_account() AND status = 'pending');

-- 9. Guard approve_creator_application against downgrading admins
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

  -- Only upgrade non-admin profiles to recipe_creator
  UPDATE profiles
  SET role = 'recipe_creator', updated_at = now()
  WHERE id = applicant_id AND role <> 'admin';
END;
$$;

-- 10. Security Cleanup: Revoke Public and Authenticated Execution on Email Lookup
REVOKE EXECUTE ON FUNCTION get_email_for_username(TEXT) FROM PUBLIC, anon, authenticated;
