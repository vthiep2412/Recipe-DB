-- Fix: Infinite recursion detected in policy for relation "profiles"
-- Root cause: Querying "profiles" directly inside a row-level security policy on "profiles"
-- Solution: SECURITY DEFINER helper functions that bypass RLS checks when inspecting roles.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- 1. Profiles Table Policies
DROP POLICY IF EXISTS "Profiles viewable by active users or self or admin" ON profiles;
CREATE POLICY "Profiles viewable by active users or self or admin"
  ON profiles FOR SELECT
  USING (
    is_archived = false
    OR auth.uid() = id
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile or admin can update any" ON profiles;
CREATE POLICY "Users can update own profile or admin can update any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR is_admin()
  )
  WITH CHECK (
    auth.uid() = id
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (is_admin());

-- 2. Recipes Table Policies
DROP POLICY IF EXISTS "Public approved recipes or own or admin" ON recipes;
CREATE POLICY "Public approved recipes or own or admin"
  ON recipes FOR SELECT
  USING (
    status = 'approved'
    OR auth.uid() = owner_id
    OR is_admin()
  );

DROP POLICY IF EXISTS "Creators and admins can insert recipes" ON recipes;
CREATE POLICY "Creators and admins can insert recipes"
  ON recipes FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
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
    auth.uid() = owner_id
    OR is_admin()
  )
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = owner_id
      AND status = 'pending'
    )
  );

DROP POLICY IF EXISTS "Owners and admins can delete recipes" ON recipes;
CREATE POLICY "Owners and admins can delete recipes"
  ON recipes FOR DELETE
  USING (
    auth.uid() = owner_id
    OR is_admin()
  );

-- 3. Recipe Details Table Policies
DROP POLICY IF EXISTS "Details viewable if parent recipe viewable" ON recipe_details;
CREATE POLICY "Details viewable if parent recipe viewable"
  ON recipe_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.status = 'approved'
          OR recipes.owner_id = auth.uid()
          OR is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "Details insertable by recipe owner or admin" ON recipe_details;
CREATE POLICY "Details insertable by recipe owner or admin"
  ON recipe_details FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.owner_id = auth.uid()
          OR is_admin()
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
          recipes.owner_id = auth.uid()
          OR is_admin()
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
          recipes.owner_id = auth.uid()
          OR is_admin()
        )
    )
  );

-- 4. Creator Applications Policies
DROP POLICY IF EXISTS "Applications viewable by owner or admin" ON creator_applications;
CREATE POLICY "Applications viewable by owner or admin"
  ON creator_applications FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_admin()
  );

DROP POLICY IF EXISTS "Authenticated users can submit application" ON creator_applications;
CREATE POLICY "Authenticated users can submit application"
  ON creator_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can update applications" ON creator_applications;
CREATE POLICY "Admins can update applications"
  ON creator_applications FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete applications" ON creator_applications;
CREATE POLICY "Admins can delete applications"
  ON creator_applications FOR DELETE
  USING (is_admin());

-- 5. Trigger Functions Security Definer Fix
CREATE OR REPLACE FUNCTION enforce_username_cooldown()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF NOT is_admin() THEN
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

CREATE OR REPLACE FUNCTION enforce_display_name_cooldown()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF NOT is_admin() THEN
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
