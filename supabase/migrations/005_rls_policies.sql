ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by active users or self or admin"
  ON profiles FOR SELECT
  USING (
    is_archived = false
    OR auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile or admin can update any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (
      auth.uid() = id
      AND role = (SELECT role FROM profiles WHERE id = auth.uid())
      AND is_archived = (SELECT is_archived FROM profiles WHERE id = auth.uid())
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Public approved recipes or own or admin"
  ON recipes FOR SELECT
  USING (
    status = 'approved'
    OR auth.uid() = owner_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Creators and admins can insert recipes"
  ON recipes FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'recipe_creator'
        AND status = 'pending'
      )
    )
  );

CREATE POLICY "Owners and admins can update recipes"
  ON recipes FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR (
      auth.uid() = owner_id
      AND status = 'pending'
    )
  );

CREATE POLICY "Owners and admins can delete recipes"
  ON recipes FOR DELETE
  USING (
    auth.uid() = owner_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Details viewable if parent recipe viewable"
  ON recipe_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.status = 'approved'
          OR recipes.owner_id = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "Details insertable by recipe owner or admin"
  ON recipe_details FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.owner_id = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "Details updatable by recipe owner or admin"
  ON recipe_details FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.owner_id = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "Details deletable by recipe owner or admin"
  ON recipe_details FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_details.recipe_id
        AND (
          recipes.owner_id = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "Applications viewable by owner or admin"
  ON creator_applications FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Authenticated users can submit application"
  ON creator_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can update applications"
  ON creator_applications FOR UPDATE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete applications"
  ON creator_applications FOR DELETE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
