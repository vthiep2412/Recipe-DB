-- ============================================================================
-- 013_rls_and_auth_hardening.sql
-- Database RLS & Authentication Hardening:
-- 1. Add missing user_bookmarks UPDATE policy (resolves 42501 on upsert).
-- 2. Restrict recipe slug availability check to approved/owned recipes (prevents draft probing).
-- 3. Resilient new user profile trigger with unique conflict handling.
-- 4. Secure administrative purge procedure execution permissions.
-- 5. Restore username-to-email resolution RPC permissions for username login.
-- ============================================================================

-- 1. Missing FOR UPDATE policy on user_bookmarks
DROP POLICY IF EXISTS "Users can update own bookmarks" ON user_bookmarks;
CREATE POLICY "Users can update own bookmarks"
  ON user_bookmarks FOR UPDATE
  USING (auth.uid() = user_id AND is_active_account())
  WITH CHECK (auth.uid() = user_id AND is_active_account());

-- 2. Harden check_recipe_slug_available against private draft probing
CREATE OR REPLACE FUNCTION check_recipe_slug_available(p_slug TEXT, p_recipe_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM recipes
    WHERE lower(slug) = lower(trim(p_slug))
      AND (
        status = 'approved'
        OR (auth.uid() IS NOT NULL AND (owner_id = auth.uid() OR is_admin()))
      )
      AND (p_recipe_id IS NULL OR id <> p_recipe_id)
  );
$$;

GRANT EXECUTE ON FUNCTION check_recipe_slug_available(TEXT, UUID) TO authenticated, anon;

-- 3. Resilient new user trigger handling username uniqueness conflicts
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
BEGIN
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8));
  base_username := trim(replace(base_username, '@', ''));
  IF base_username = '' THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  final_username := base_username;

  BEGIN
    INSERT INTO profiles (id, username, display_name)
    VALUES (
      NEW.id,
      final_username,
      COALESCE(NEW.raw_user_meta_data->>'display_name', final_username)
    );
  EXCEPTION WHEN unique_violation THEN
    -- Fallback: append deterministic short uuid fragment to ensure signup succeeds
    final_username := substr(base_username, 1, 20) || '_' || substr(NEW.id::text, 1, 6);
    INSERT INTO profiles (id, username, display_name)
    VALUES (
      NEW.id,
      final_username,
      COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User')
    );
  END;

  RETURN NEW;
END;
$$;

-- 4. Restrict execution on administrative purge maintenance procedure
REVOKE EXECUTE ON FUNCTION purge_expired_scheduled_deletions() FROM PUBLIC, anon;

-- 5. Secure username lookup for login flow
CREATE OR REPLACE FUNCTION get_email_for_username(p_username TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_email TEXT;
  v_user_id UUID;
BEGIN
  IF p_username IS NULL OR trim(p_username) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_user_id
  FROM profiles
  WHERE lower(username) = lower(trim(replace(p_username, '@', '')))
    AND is_archived = false
    AND is_admin_deleted = false
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_for_username(TEXT) TO anon, authenticated;
