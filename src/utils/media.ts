import { useState, useEffect } from 'preact/hooks';
import { localMediaStore } from '../services/localMediaStore';
import { getOptimizedImageUrl, type ImageVariant } from '../services/cloudinaryUpload';

/**
 * Utility for parsing and extracting YouTube video IDs and building embed URLs.
 */
export function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    // Check if already an embed or standard youtube URL
    const regExp = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmed.match(regExp);

    if (match && match[1]) {
      const videoId = match[1];
      return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    }
  } catch {
    // Parsing fallback
  }

  return null;
}

/**
 * Resolves a media reference to a displayable URL:
 * - If reference starts with 'idb:', loads the local blob from IndexedDB and creates a temporary blob ObjectURL.
 * - Otherwise, applies client-side Cloudinary optimization if applicable.
 */
export function useResolvedMediaUrl(rawUrl?: string | null, variant?: ImageVariant): string {
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('idb:')) return '';
    return getOptimizedImageUrl(rawUrl, variant);
  });

  useEffect(() => {
    if (!rawUrl) {
      setResolvedUrl('');
      return;
    }

    if (!rawUrl.startsWith('idb:')) {
      setResolvedUrl(getOptimizedImageUrl(rawUrl, variant));
      return;
    }

    let isCurrent = true;
    let objectUrl = '';

    localMediaStore
      .loadBlob(rawUrl)
      .then((blob) => {
        if (isCurrent && blob) {
          objectUrl = URL.createObjectURL(blob);
          setResolvedUrl(objectUrl);
        }
      })
      .catch(() => {});

    return () => {
      isCurrent = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [rawUrl, variant]);

  return resolvedUrl;
}

