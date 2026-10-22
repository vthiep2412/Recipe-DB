-- 0006_triggers.sql

-- Function and trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    'user_' || substring(new.id::text, 1, 8)
  );
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    'Chef ' || substring(new.id::text, 1, 6)
  );

  INSERT INTO public.profiles (id, username, display_name, avatar_url, role)
  VALUES (
    new.id,
    v_username,
    v_display_name,
    new.raw_user_meta_data->>'avatar_url',
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = NOW();
  RETURN new;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_details_updated_at
  BEFORE UPDATE ON public.recipe_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to enforce profile identity change throttling (cooldowns)
CREATE OR REPLACE FUNCTION public.enforce_profile_cooldowns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If username changed, enforce 14 day cooldown unless admin
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.last_username_change > (NOW() - INTERVAL '14 days') AND (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
      RAISE EXCEPTION 'Username can only be changed once every 14 days.';
    END IF;
    NEW.last_username_change = NOW();
  END IF;

  -- If display name changed, enforce 3 day cooldown unless admin
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF OLD.last_display_name_change > (NOW() - INTERVAL '3 days') AND (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
      RAISE EXCEPTION 'Display name can only be changed once every 3 days.';
    END IF;
    NEW.last_display_name_change = NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_profile_cooldowns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_cooldowns();

-- Function for admins to immediately hard delete a user and all related data
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS NULL OR v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: only admins can delete users';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
  RETURN TRUE;
END;
$$;
