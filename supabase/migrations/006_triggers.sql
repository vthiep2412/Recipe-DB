CREATE OR REPLACE FUNCTION enforce_username_cooldown()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
      IF OLD.username_last_changed_at IS NOT NULL
         AND now() - OLD.username_last_changed_at < INTERVAL '30 days' THEN
        RAISE EXCEPTION 'Username can only be changed once every 30 days.';
      END IF;
    END IF;
    NEW.username_last_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS username_cooldown_trigger ON profiles;
CREATE TRIGGER username_cooldown_trigger
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION enforce_username_cooldown();

CREATE OR REPLACE FUNCTION enforce_display_name_cooldown()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
      IF OLD.display_name_last_changed_at IS NOT NULL
         AND now() - OLD.display_name_last_changed_at < INTERVAL '24 hours' THEN
        RAISE EXCEPTION 'Display name can only be changed once every 24 hours.';
      END IF;
    END IF;
    NEW.display_name_last_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS display_name_cooldown_trigger ON profiles;
CREATE TRIGGER display_name_cooldown_trigger
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION enforce_display_name_cooldown();

CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;
  END IF;
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only administrators can archive user accounts.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_escalation ON profiles;
CREATE TRIGGER prevent_role_escalation
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION prevent_unauthorized_role_change();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION approve_creator_application(app_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  applicant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT user_id INTO applicant_id FROM creator_applications WHERE id = app_id;
  IF applicant_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE creator_applications
  SET status = 'approved', reviewed_at = now()
  WHERE id = app_id;

  UPDATE profiles
  SET role = 'recipe_creator'
  WHERE id = applicant_id;
END;
$$;
