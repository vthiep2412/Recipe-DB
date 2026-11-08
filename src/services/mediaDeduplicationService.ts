import { computeImageDHash, computeHammingDistance } from '../utils/imageOptimizer';
import { localMediaStore } from './localMediaStore';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface DeduplicationLookupResult {
  url: string;
  phash: string;
  aspectRatio?: number;
  matchedFrom: 'local_exact' | 'local_near' | 'supabase';
}

/**
 * Checks both the local IndexedDB cache and the shared Supabase media registry
 * for an existing Cloudinary image matching or visually near-matching (256-bit Hamming distance <= 8)
 * and respecting the Aspect Ratio Guard (relative difference <= 2%).
 */
export async function findExistingCloudinaryAsset(
  source: File | Blob
): Promise<DeduplicationLookupResult | null> {
  const fingerprint = await computeImageDHash(source);
  if (!fingerprint) return null;
  const { phash, aspectRatio } = fingerprint;

  // 1. Fast local exact match
  try {
    const localExact = await localMediaStore.getPhashMapping(phash);
    if (localExact) {
      return {
        url: localExact,
        phash,
        aspectRatio,
        matchedFrom: 'local_exact'
      };
    }

    // 2. Local near match across stored mappings with Aspect Ratio Guard
    const localMappings = await localMediaStore.getAllPhashMappings();
    for (const mapping of localMappings) {
      if (
        mapping.aspectRatio !== undefined &&
        aspectRatio !== undefined &&
        Math.abs(mapping.aspectRatio - aspectRatio) / aspectRatio > 0.02
      ) {
        continue;
      }

      const dist = computeHammingDistance(phash, mapping.phash);
      if (dist <= 8) {
        // Also map this specific variant to IndexedDB for instant future hits
        await localMediaStore.savePhashMapping(phash, mapping.cloudinaryUrl, aspectRatio);
        return {
          url: mapping.cloudinaryUrl,
          phash,
          aspectRatio,
          matchedFrom: 'local_near'
        };
      }
    }
  } catch (err) {
    console.warn('[mediaDeduplicationService] Local IndexedDB lookup failed', err);
  }

  // 3. Central Supabase lookup (cross-user / cross-device)
  if (isSupabaseConfigured) {
    try {
      // Try similarity RPC first
      const { data: rpcUrl, error: rpcError } = await supabase.rpc('find_similar_media_asset', {
        input_phash: phash,
        input_aspect_ratio: aspectRatio,
        max_distance: 8
      });

      if (!rpcError && rpcUrl && typeof rpcUrl === 'string') {
        await localMediaStore.savePhashMapping(phash, rpcUrl, aspectRatio);
        return {
          url: rpcUrl,
          phash,
          aspectRatio,
          matchedFrom: 'supabase'
        };
      }

      // Fallback direct table query if RPC is not yet registered
      if (rpcError) {
        const { data: row } = await supabase
          .from('media_assets')
          .select('cloudinary_url, aspect_ratio')
          .eq('phash', phash)
          .maybeSingle();

        if (row && row.cloudinary_url) {
          const rowRatio = typeof row.aspect_ratio === 'number' ? row.aspect_ratio : undefined;
          if (
            !rowRatio ||
            !aspectRatio ||
            Math.abs(rowRatio - aspectRatio) / aspectRatio <= 0.02
          ) {
            await localMediaStore.savePhashMapping(phash, row.cloudinary_url, aspectRatio);
            return {
              url: row.cloudinary_url,
              phash,
              aspectRatio,
              matchedFrom: 'supabase'
            };
          }
        }
      }
    } catch (err) {
      console.warn('[mediaDeduplicationService] Supabase deduplication query failed', err);
    }
  }

  return null;
}

/**
 * Registers a newly uploaded Cloudinary image in both local IndexedDB
 * and the shared Supabase media registry.
 */
export async function registerUploadedAsset(
  phash: string,
  cloudinaryUrl: string,
  aspectRatio?: number
): Promise<void> {
  if (!phash || !cloudinaryUrl) return;

  // 1. Cache locally
  try {
    await localMediaStore.savePhashMapping(phash, cloudinaryUrl, aspectRatio);
  } catch (err) {
    console.warn('[mediaDeduplicationService] Failed saving to local IndexedDB', err);
  }

  // 2. Persist to central Supabase registry
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('media_assets').upsert(
        {
          phash,
          cloudinary_url: cloudinaryUrl,
          aspect_ratio: aspectRatio
        },
        { onConflict: 'phash' }
      );
      if (error) {
        console.warn('[mediaDeduplicationService] Supabase asset registration error', error.message);
      }
    } catch (err) {
      console.warn('[mediaDeduplicationService] Failed registering asset in Supabase', err);
    }
  }
}
