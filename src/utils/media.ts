import { useState, useEffect } from 'preact/hooks';
import { localMediaStore } from '../services/localMediaStore';
import { getOptimizedImageUrl, type ImageVariant } from '../services/cloudinaryUpload';
import type { RecipeJSON } from '../types/recipe';

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

function collectIdbUrls(recipe?: RecipeJSON | null): string[] {
  if (!recipe) return [];
  const set = new Set<string>();
  if (recipe.image?.startsWith('idb:')) set.add(recipe.image);
  recipe.gallery?.forEach(u => { if (u?.startsWith('idb:')) set.add(u); });
  recipe.sections?.forEach(sec => {
    if (sec.image?.startsWith('idb:')) set.add(sec.image);
    sec.media?.galleryUrls?.forEach(u => { if (u?.startsWith('idb:')) set.add(u); });
    sec.subsections?.forEach(sub => {
      if (sub.image?.startsWith('idb:')) set.add(sub.image);
      sub.media?.galleryUrls?.forEach(u => { if (u?.startsWith('idb:')) set.add(u); });
      sub.steps?.forEach(st => {
        if (st.image?.startsWith('idb:')) set.add(st.image);
        st.media?.galleryUrls?.forEach(u => { if (u?.startsWith('idb:')) set.add(u); });
      });
    });
    sec.steps?.forEach(st => {
      if (st.image?.startsWith('idb:')) set.add(st.image);
      st.media?.galleryUrls?.forEach(u => { if (u?.startsWith('idb:')) set.add(u); });
    });
  });
  return Array.from(set);
}

function replaceIdbUrlsInRecipe(recipe: RecipeJSON, map: Map<string, string>): RecipeJSON {
  const replaceUrl = (u?: string) => (u && map.has(u) ? map.get(u)! : u);
  const replaceList = (list?: string[]) => list?.map(u => replaceUrl(u)!);

  return {
    ...recipe,
    image: replaceUrl(recipe.image),
    gallery: replaceList(recipe.gallery),
    sections: recipe.sections?.map(sec => ({
      ...sec,
      image: replaceUrl(sec.image),
      media: sec.media ? { ...sec.media, galleryUrls: replaceList(sec.media.galleryUrls) } : sec.media,
      subsections: sec.subsections?.map(sub => ({
        ...sub,
        image: replaceUrl(sub.image),
        media: sub.media ? { ...sub.media, galleryUrls: replaceList(sub.media.galleryUrls) } : sub.media,
        steps: sub.steps?.map(st => ({
          ...st,
          image: replaceUrl(st.image),
          media: st.media ? { ...st.media, galleryUrls: replaceList(st.media.galleryUrls) } : st.media
        }))
      })),
      steps: sec.steps?.map(st => ({
        ...st,
        image: replaceUrl(st.image),
        media: st.media ? { ...st.media, galleryUrls: replaceList(st.media.galleryUrls) } : st.media
      }))
    }))
  };
}

/**
 * Resolves all 'idb:' media references in a RecipeJSON to displayable temporary blob URLs.
 * Automatically cleans up object URLs on unmount or recipe change.
 */
export function useResolvedRecipeMedia(recipe?: RecipeJSON | null): RecipeJSON | null {
  const [resolvedRecipe, setResolvedRecipe] = useState<RecipeJSON | null>(recipe || null);

  useEffect(() => {
    if (!recipe) {
      setResolvedRecipe(null);
      return;
    }

    const idbUrls = collectIdbUrls(recipe);
    if (idbUrls.length === 0) {
      setResolvedRecipe(recipe);
      return;
    }

    let isCurrent = true;
    const createdObjectUrls: string[] = [];

    Promise.all(
      idbUrls.map(async (idbUrl) => {
        try {
          const blob = await localMediaStore.loadBlob(idbUrl);
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            createdObjectUrls.push(objectUrl);
            return [idbUrl, objectUrl] as [string, string];
          }
        } catch (_) {}
        return [idbUrl, idbUrl] as [string, string];
      })
    ).then((entries) => {
      if (!isCurrent) {
        createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
        return;
      }
      const map = new Map<string, string>(entries);
      setResolvedRecipe(replaceIdbUrlsInRecipe(recipe, map));
    });

    return () => {
      isCurrent = false;
      createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [recipe]);

  return resolvedRecipe;
}

