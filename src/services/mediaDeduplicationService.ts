import { computeImageDHash, computeHammingDistance } from '../utils/imageOptimizer';
import { localMediaStore } from './localMediaStore';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface DeduplicationLookupResult {
  url: string;
  phash: string;
  matchedFrom: 'local_exact' | 'local_near' | 'supabase';
}

/**
 * Checks both the local IndexedDB cache and the shared Supabase media registry
 * for an existing Cloudinary image matching or visually near-matching (Hamming distance <= 3)
 * the given image source.
 */
export async function findExistingCloudinaryAsset(
  source: File | Blob
): Promise<DeduplicationLookupResult | null> {
  const phash = await computeImageDHash(source);
  if (!phash) return null;

  // 1. Fast local exact match
  try {
    const localExact = await localMediaStore.getPhashMapping(phash);
    if (localExact) {
      return {
        url: localExact,
        phash,
        matchedFrom: 'local_exact'
      };
    }

    // 2. Local near match across stored mappings
    const localMappings = await localMediaStore.getAllPhashMappings();
    for (const mapping of localMappings) {
      const dist = computeHammingDistance(phash, mapping.phash);
      if (dist <= 3) {
        // Also map this specific variant to IndexedDB for instant future hits
        await localMediaStore.savePhashMapping(phash, mapping.cloudinaryUrl);
        return {
          url: mapping.cloudinaryUrl,
          phash,
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
        max_distance: 3
      });

      if (!rpcError && rpcUrl && typeof rpcUrl === 'string') {
        await localMediaStore.savePhashMapping(phash, rpcUrl);
        return {
          url: rpcUrl,
          phash,
          matchedFrom: 'supabase'
        };
      }

      // Fallback direct table query if RPC is not yet registered
      if (rpcError) {
        const { data: row } = await supabase
          .from('media_assets')
          .select('cloudinary_url')
          .eq('phash', phash)
          .maybeSingle();

        if (row && row.cloudinary_url) {
          await localMediaStore.savePhashMapping(phash, row.cloudinary_url);
          return {
            url: row.cloudinary_url,
            phash,
            matchedFrom: 'supabase'
          };
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
  cloudinaryUrl: string
): Promise<void> {
  if (!phash || !cloudinaryUrl) return;

  // 1. Cache locally
  try {
    await localMediaStore.savePhashMapping(phash, cloudinaryUrl);
  } catch (err) {
    console.warn('[mediaDeduplicationService] Failed saving to local IndexedDB', err);
  }

  // 2. Persist to central Supabase registry
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('media_assets').upsert(
        {
          phash,
          cloudinary_url: cloudinaryUrl
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
