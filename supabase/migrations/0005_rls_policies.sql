-- 0005_rls_policies.sql

-- Enable RLS on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_details ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- PROFILES POLICIES
----------------------------------------------------
-- Anyone can view profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile, admins can update any
CREATE POLICY "Users can update own profile or admin can update any"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

----------------------------------------------------
-- CREATOR APPLICATIONS POLICIES
----------------------------------------------------
-- Users can view their own applications, admins can view all
CREATE POLICY "Users view own applications or admin views all"
  ON public.creator_applications FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Authenticated users can insert application for themselves
CREATE POLICY "Users can submit own creator application"
  ON public.creator_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can update creator applications
CREATE POLICY "Admins can update creator applications"
  ON public.creator_applications FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

----------------------------------------------------
-- RECIPES POLICIES
----------------------------------------------------
-- Anyone can read approved recipes; author or admin can read pending/rejected recipes
CREATE POLICY "Public read approved recipes, author/admin read any"
  ON public.recipes FOR SELECT
  USING (
    status = 'approved' OR
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Creators and admins can insert recipes
CREATE POLICY "Creators and admins can insert recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('recipe_creator', 'admin')
    )
  );

-- Authors can update their own recipes; admins can update any
CREATE POLICY "Authors or admins can update recipes"
  ON public.recipes FOR UPDATE
  USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Authors can delete own recipes; admins can delete any
CREATE POLICY "Authors or admins can delete recipes"
  ON public.recipes FOR DELETE
  USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

----------------------------------------------------
-- RECIPE DETAILS POLICIES
----------------------------------------------------
-- Details follow recipe visibility
CREATE POLICY "Recipe details follow recipe policy"
  ON public.recipe_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_details.recipe_id AND (
        recipes.status = 'approved' OR
        recipes.author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Creators and admins can insert recipe details
CREATE POLICY "Creators and admins insert recipe details"
  ON public.recipe_details FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_details.recipe_id AND (
        recipes.author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Authors and admins can update recipe details
CREATE POLICY "Authors and admins update recipe details"
  ON public.recipe_details FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_details.recipe_id AND (
        recipes.author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Authors and admins can delete recipe details
CREATE POLICY "Authors and admins delete recipe details"
  ON public.recipe_details FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE recipes.id = recipe_details.recipe_id AND (
        recipes.author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );
