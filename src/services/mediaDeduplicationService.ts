import { computeImageDHash, computeHammingDistance, ImageFingerprint } from '../utils/imageOptimizer';
import { localMediaStore } from './localMediaStore';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface DeduplicationLookupResult {
  url: string;
  phash: string;
  aspectRatio?: number;
  matchedFrom: 'local_exact' | 'local_near' | 'supabase';
}

export interface DeduplicationLookupWithFingerprintResult {
  existingUrl: string | null;
  fingerprint: ImageFingerprint | null;
  matchedFrom?: 'local_exact' | 'local_near' | 'supabase';
}

/**
 * Normalizes a Cloudinary delivery URL to its 17x16 BMP thumbnail endpoint
 * for serverless/low-bandwidth dHash computation.
 */
export function toCloudinaryBmpThumbnailUrl(url: string): string {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  const baseUrl = url.substring(0, uploadIdx + 8);
  let rest = url.substring(uploadIdx + 8);

  const versionMatch = rest.match(/(v\d+\/.*)/);
  if (versionMatch) {
    rest = versionMatch[1];
  }

  const lastDot = rest.lastIndexOf('.');
  if (lastDot !== -1) {
    rest = rest.substring(0, lastDot) + '.bmp';
  } else {
    rest = rest + '.bmp';
  }

  return `${baseUrl}w_17,h_16,c_scale/${rest}`;
}

/**
 * Checks both the local IndexedDB cache and the shared Supabase media registry
 * for an existing Cloudinary image matching or visually near-matching (256-bit Hamming distance <= 8)
 * and respecting the Aspect Ratio Guard (relative difference <= 2%).
 * Returns both the existing URL (if found) and the pre-computed fingerprint.
 */
export async function findExistingCloudinaryAssetWithFingerprint(
  source: File | Blob
): Promise<DeduplicationLookupWithFingerprintResult> {
  const fingerprint = await computeImageDHash(source);
  if (!fingerprint) {
    return { existingUrl: null, fingerprint: null };
  }
  const { phash, aspectRatio } = fingerprint;

  // 1. Fast local exact match
  try {
    const localExact = await localMediaStore.getPhashMapping(phash);
    if (localExact) {
      return {
        existingUrl: localExact,
        fingerprint,
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
        await localMediaStore.savePhashMapping(phash, mapping.cloudinaryUrl, aspectRatio);
        return {
          existingUrl: mapping.cloudinaryUrl,
          fingerprint,
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
          existingUrl: rpcUrl,
          fingerprint,
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
              existingUrl: row.cloudinary_url,
              fingerprint,
              matchedFrom: 'supabase'
            };
          }
        }
      }
    } catch (err) {
      console.warn('[mediaDeduplicationService] Supabase deduplication query failed', err);
    }
  }

  return { existingUrl: null, fingerprint };
}

/**
 * Checks both the local IndexedDB cache and the shared Supabase media registry
 * for an existing Cloudinary image matching or visually near-matching (256-bit Hamming distance <= 8)
 * and respecting the Aspect Ratio Guard (relative difference <= 2%).
 */
export async function findExistingCloudinaryAsset(
  source: File | Blob
): Promise<DeduplicationLookupResult | null> {
  const result = await findExistingCloudinaryAssetWithFingerprint(source);
  if (!result.existingUrl || !result.fingerprint) {
    return null;
  }
  return {
    url: result.existingUrl,
    phash: result.fingerprint.phash,
    aspectRatio: result.fingerprint.aspectRatio,
    matchedFrom: result.matchedFrom!
  };
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

/**
 * Computes the 256-bit perceptual hash and registers a Cloudinary image
 * directly from its URL (used as a fallback when client-side fetch of an external image is blocked by CORS).
 */
export async function registerAssetFromCloudinaryUrl(
  cloudinaryUrl: string,
  width?: number,
  height?: number
): Promise<void> {
  if (!cloudinaryUrl) return;
  try {
    const bmpUrl = toCloudinaryBmpThumbnailUrl(cloudinaryUrl);
    const res = await fetch(bmpUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const fp = await computeImageDHash(blob);
    if (fp) {
      const aspectRatio =
        width && height && height > 0
          ? Number((width / height).toFixed(3))
          : fp.aspectRatio;
      await registerUploadedAsset(fp.phash, cloudinaryUrl, aspectRatio);
    }
  } catch (err) {
    console.warn('[mediaDeduplicationService] Failed registering asset from Cloudinary URL', err);
  }
}
