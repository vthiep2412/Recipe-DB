-- ============================================================================
-- 014_fix_ban_infinity_to_interval.sql
-- Fix GoTrue time.Time parsing failure caused by PostgreSQL 'infinity'.
-- 1. Updates revoke_user_sessions_and_ban to ban for 99999 years instead of 'infinity'.
-- 2. Hardens is_admin() helper to recognize service_role, postgres, and supabase_admin.
-- 3. Clears any legacy 'infinity' banned_until values to prevent account lockouts on delete/update.
-- ============================================================================

-- 1. Update is_admin() helper to recognize postgres, supabase_admin, and service_role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (
    current_user IN ('postgres', 'supabase_admin')
    OR (current_setting('request.jwt.claim.role', true) = 'service_role')
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
$$;

-- 2. Redefine revoke_user_sessions_and_ban to use 99999 years interval instead of 'infinity'
CREATE OR REPLACE FUNCTION revoke_user_sessions_and_ban(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Terminate all active sessions (kills refresh tokens)
  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  -- Block auth sign-in and token issuance in GoTrue using 99999 years interval
  UPDATE auth.users
  SET banned_until = now() + INTERVAL '99999 years'
  WHERE id = p_user_id;
END;
$$;

-- 3. Clear any legacy 'infinity' timestamps on auth.users
UPDATE auth.users
SET banned_until = NULL
WHERE banned_until = 'infinity'::timestamptz;
