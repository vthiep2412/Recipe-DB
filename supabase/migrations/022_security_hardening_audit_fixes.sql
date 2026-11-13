-- ============================================================================
-- 022_security_hardening_audit_fixes.sql
-- Fixes findings from CodeRabbit audit:
-- 1. Revoke public/anon execute on revoke_user_sessions_and_ban helper
-- 2. Harden is_admin() against three-valued logic NULL bypass
-- 3. Restrict remap_cloudinary_media_pair to service_role
-- ============================================================================

-- 1. Restrict revoke_user_sessions_and_ban to service_role only
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions_and_ban(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions_and_ban(UUID) TO service_role;

-- 2. Harden is_admin() helper to guarantee strict non-null boolean evaluation
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (
      (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      OR (
        CASE
          WHEN nullif(current_setting('request.jwt.claims', true), '') IS NOT NULL
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
          ELSE false
        END
      )
      OR (
        auth.uid() IS NOT NULL
        AND is_active_account(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 3. Restrict remap_cloudinary_media_pair to service_role only
REVOKE EXECUTE ON FUNCTION public.remap_cloudinary_media_pair(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remap_cloudinary_media_pair(TEXT, TEXT) TO service_role;
