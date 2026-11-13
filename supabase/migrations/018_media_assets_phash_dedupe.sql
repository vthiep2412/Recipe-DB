-- 018_media_assets_phash_dedupe.sql
-- Global cross-user and cross-device image deduplication via perceptual Difference Hashing (dHash).

CREATE TABLE IF NOT EXISTS public.media_assets (
  phash          TEXT PRIMARY KEY,
  cloudinary_url TEXT NOT NULL,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Public can query image hashes to deduplicate before uploading
DROP POLICY IF EXISTS "Public read media assets" ON public.media_assets;
CREATE POLICY "Public read media assets"
  ON public.media_assets
  FOR SELECT
  USING (true);

-- 2. Insert Policy: Users can register newly uploaded Cloudinary image hashes
DROP POLICY IF EXISTS "Register media assets" ON public.media_assets;
CREATE POLICY "Register media assets"
  ON public.media_assets
  FOR INSERT
  WITH CHECK (true);

-- 3. Prevent modification and deletion (immutable ledger of cloud assets)
DROP POLICY IF EXISTS "Prevent update media assets" ON public.media_assets;
CREATE POLICY "Prevent update media assets"
  ON public.media_assets
  FOR UPDATE
  USING (false);

-- Function to find exact or near-match perceptual hash (Hamming distance <= max_distance)
CREATE OR REPLACE FUNCTION public.find_similar_media_asset(
  input_phash TEXT,
  max_distance INT DEFAULT 3
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
  IF input_phash IS NULL OR length(input_phash) <> 16 THEN
    RETURN NULL;
  END IF;

  -- 1. Fast exact B-tree primary key lookup
  SELECT cloudinary_url INTO exact_match
  FROM public.media_assets
  WHERE phash = input_phash
  LIMIT 1;

  IF exact_match IS NOT NULL THEN
    RETURN exact_match;
  END IF;

  -- 2. Near-match scan calculating Hamming distance via 64-bit XOR and bit_count
  SELECT cloudinary_url INTO similar_match
  FROM public.media_assets
  WHERE bit_count(('x' || phash)::bit(64) # ('x' || input_phash)::bit(64)) <= max_distance
  ORDER BY bit_count(('x' || phash)::bit(64) # ('x' || input_phash)::bit(64)) ASC
  LIMIT 1;

  RETURN similar_match;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback safety if bit conversion fails
    RETURN NULL;
END;
$$;
