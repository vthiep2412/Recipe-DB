-- 0004_recipe_details.sql
CREATE TABLE IF NOT EXISTS public.recipe_details (
  recipe_id UUID PRIMARY KEY REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipment JSONB DEFAULT '[]'::jsonb,
  nutrition JSONB DEFAULT '{}'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
