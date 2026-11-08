-- 019_media_assets_256bit.sql
-- Upgrade media deduplication to 256-bit dHash (17x16 grid) and Aspect Ratio Guard (relative tolerance <= 2%).

-- 1. Add aspect_ratio column to media_assets
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC(5, 3);

-- 2. Update find_similar_media_asset RPC function
CREATE OR REPLACE FUNCTION public.find_similar_media_asset(
  input_phash TEXT,
  input_aspect_ratio NUMERIC DEFAULT NULL,
  max_distance INT DEFAULT 8
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exact_match TEXT;
  similar_match TEXT;
BEGIN
  IF input_phash IS NULL OR length(input_phash) <> 64 THEN
    RETURN NULL;
  END IF;

  -- 1. Exact 256-bit match lookup with relative aspect ratio filter (<= 2%)
  SELECT cloudinary_url INTO exact_match
  FROM public.media_assets
  WHERE phash = input_phash
    AND (
      input_aspect_ratio IS NULL
      OR aspect_ratio IS NULL
      OR (abs(aspect_ratio - input_aspect_ratio) / input_aspect_ratio) <= 0.02
    )
  LIMIT 1;

  IF exact_match IS NOT NULL THEN
    RETURN exact_match;
  END IF;

  -- 2. Hamming distance scan over 256-bit bitstrings with relative aspect ratio guard
  SELECT cloudinary_url INTO similar_match
  FROM public.media_assets
  WHERE (
      input_aspect_ratio IS NULL
      OR aspect_ratio IS NULL
      OR (abs(aspect_ratio - input_aspect_ratio) / input_aspect_ratio) <= 0.02
    )
    AND bit_count(('x' || phash)::bit(256) # ('x' || input_phash)::bit(256)) <= max_distance
  ORDER BY bit_count(('x' || phash)::bit(256) # ('x' || input_phash)::bit(256)) ASC
  LIMIT 1;

  RETURN similar_match;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;
