-- 020_cleanup_legacy_64bit_hashes.sql
-- Remove legacy 16-character (64-bit) hashes superseded by 256-bit hashes.

DELETE FROM public.media_assets WHERE length(phash) < 64;
