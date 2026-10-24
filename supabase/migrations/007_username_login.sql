-- Function to resolve login email from username for username login support
CREATE OR REPLACE FUNCTION get_email_for_username(p_username TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_email TEXT;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM profiles
  WHERE lower(username) = lower(trim(replace(p_username, '@', '')))
    AND is_archived = false
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
