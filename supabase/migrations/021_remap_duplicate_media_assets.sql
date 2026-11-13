-- 021_remap_duplicate_media_assets.sql
-- Helper function to safely remap duplicate Cloudinary image URLs across recipes and recipe_details

CREATE OR REPLACE FUNCTION public.remap_cloudinary_media_pair(old_url TEXT, new_url TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF old_url IS NULL OR new_url IS NULL OR old_url = new_url THEN
    RETURN;
  END IF;

  -- 1. Update recipes image_url if pointing to duplicate
  UPDATE public.recipes
  SET image_url = new_url
  WHERE image_url = old_url;

  -- 2. Update recipe_details raw_fablang
  UPDATE public.recipe_details
  SET raw_fablang = replace(raw_fablang, old_url, new_url)
  WHERE raw_fablang LIKE '%' || old_url || '%';

  -- 3. Update recipe_details sections_ast
  UPDATE public.recipe_details
  SET sections_ast = replace(sections_ast::text, old_url, new_url)::jsonb
  WHERE sections_ast::text LIKE '%' || old_url || '%';

  -- 4. Remove duplicate mapping from media_assets
  DELETE FROM public.media_assets
  WHERE cloudinary_url = old_url;
END;
$$;
