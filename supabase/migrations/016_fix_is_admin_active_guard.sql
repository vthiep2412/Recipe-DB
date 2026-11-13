-- Migration 016: Fix is_admin() active account guard and remove definer role leak
-- Ensures administrative privileges require an active account and valid admin role without definer-owner bypass.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (
    (current_setting('request.jwt.claim.role', true) = 'service_role')
    OR (
      auth.uid() IS NOT NULL
      AND is_active_account(auth.uid())
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, service_role;
