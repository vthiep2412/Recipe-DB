-- 010_cloud_architecture.sql
-- Cloud Full Architecture Migration:
-- 1. Tables for user recipe progress, settings, and bookmarks.
-- 2. profiles.is_admin_deleted column + lifecycle protection.
-- 3. Dedicated slug availability verification RPC.
-- 4. Automated 30-day scheduled deletion purge procedure and pg_cron maintenance job.

-- ============================================================================
-- 1. User Recipe Progress Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_recipe_progress (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id             TEXT NOT NULL,
  sidebar_mode          TEXT DEFAULT 'prep',
  checked_prep_items    JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_cooking_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_step_index     INTEGER NOT NULL DEFAULT 0,
  active_section_id     TEXT,
  client_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_recipe_progress UNIQUE (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_recipe_progress_user_id ON user_recipe_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_recipe_progress_recipe_id ON user_recipe_progress(recipe_id);

-- ============================================================================
-- 2. User Settings Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  settings          JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. User Bookmarks Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_recipe_bookmark UNIQUE (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user_id ON user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_recipe_id ON user_bookmarks(recipe_id);

-- ============================================================================
-- 4. Extend Profiles with Admin-Deletion Tracking
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Update trigger function to prevent non-admins from modifying is_admin_deleted
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
      NEW.is_admin_deleted := false;
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

-- Protect cancel_account_deletion against admin-deleted self-restoration
CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_is_admin_deleted BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin_deleted INTO v_is_admin_deleted
  FROM profiles
  WHERE id = auth.uid();

  IF v_is_admin_deleted IS TRUE AND NOT is_admin() THEN
    RAISE EXCEPTION 'Admin-deleted accounts cannot self-restore. Please contact support.';
  END IF;

  PERFORM set_config('app.allow_account_deletion', 'true', true);

  UPDATE profiles
  SET scheduled_delete_at = NULL,
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

-- Admin procedure to schedule deletion and mark as admin-deleted
CREATE OR REPLACE FUNCTION admin_schedule_account_deletion(target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
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
END;
$$;

-- Admin procedure to restore an account and clear admin-deletion flag
CREATE OR REPLACE FUNCTION admin_restore_account(target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can restore admin-deleted accounts.';
  END IF;

  PERFORM set_config('app.allow_account_deletion', 'true', true);

  UPDATE profiles
  SET scheduled_delete_at = NULL,
      is_admin_deleted = false,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_schedule_account_deletion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_restore_account(UUID) TO authenticated;

-- ============================================================================
-- 5. Recipe Slug Availability Check (Cross-RLS Safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_recipe_slug_available(p_slug TEXT, p_recipe_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM recipes
    WHERE lower(slug) = lower(trim(p_slug))
      AND (p_recipe_id IS NULL OR id <> p_recipe_id)
  );
$$;

GRANT EXECUTE ON FUNCTION check_recipe_slug_available(TEXT, UUID) TO authenticated, anon;

-- ============================================================================
-- 6. Row Level Security Policies
-- ============================================================================
ALTER TABLE user_recipe_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;

-- user_recipe_progress policies
CREATE POLICY "Users can view own recipe progress or admin"
  ON user_recipe_progress FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert own recipe progress"
  ON user_recipe_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipe progress"
  ON user_recipe_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipe progress or admin"
  ON user_recipe_progress FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- user_settings policies
CREATE POLICY "Users can view own settings or admin"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings or admin"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- user_bookmarks policies
CREATE POLICY "Users can view own bookmarks or admin"
  ON user_bookmarks FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert own bookmarks"
  ON user_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks or admin"
  ON user_bookmarks FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ============================================================================
-- 7. Automated 30-Day Hard Deletion Purge Procedure & Cron
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_expired_scheduled_deletions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Delete users from auth.users whose scheduled_delete_at has elapsed
  -- ON DELETE CASCADE will automatically wipe profiles, recipes, and related user rows
  WITH expired_users AS (
    SELECT id
    FROM public.profiles
    WHERE scheduled_delete_at IS NOT NULL
      AND scheduled_delete_at <= now()
  ),
  deleted_auth_users AS (
    DELETE FROM auth.users
    WHERE id IN (SELECT id FROM expired_users)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM deleted_auth_users;

  -- Ensure any dangling profile records without auth user are also purged
  DELETE FROM public.profiles
  WHERE scheduled_delete_at IS NOT NULL
    AND scheduled_delete_at <= now();

  RETURN v_count;
END;
$$;

-- Register scheduled daily execution at midnight if pg_cron is available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) OR EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    PERFORM cron.unschedule('daily-purge-expired-accounts')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-purge-expired-accounts'
    );

    PERFORM cron.schedule(
      'daily-purge-expired-accounts',
      '0 0 * * *',
      'SELECT public.purge_expired_scheduled_deletions();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron registration skipped: %', SQLERRM;
END;
$$;
