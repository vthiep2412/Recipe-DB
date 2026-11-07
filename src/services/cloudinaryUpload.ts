import type {
  CloudinaryAssetType,
  CloudinaryResult,
  CloudinaryServiceAPI
} from '../types/cloud';

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string) || '';
const UPLOAD_PRESET = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string) || '';
const API_KEY = (import.meta.env.VITE_CLOUDINARY_API_KEY as string) || '';

async function downscaleIfNeeded(blob: Blob): Promise<Blob> {
  if (blob.size <= 4 * 1024 * 1024) {
    return blob;
  }

  if (typeof window === 'undefined' || typeof createImageBitmap === 'undefined') {
    return blob;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const maxDim = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 2560 / maxDim);
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return blob;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    return await new Promise<Blob>(resolve => {
      canvas.toBlob(
        resultBlob => {
          canvas.width = 0;
          canvas.height = 0;
          resolve(resultBlob || blob);
        },
        'image/jpeg',
        0.92
      );
    });
  } catch {
    return blob;
  } finally {
    bitmap?.close?.();
  }
}

export async function uploadAsset(
  source: Blob | string,
  type: CloudinaryAssetType,
  folder: 'recipes/images' | 'recipes/videos'
): Promise<CloudinaryResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary credentials not configured in environment');
  }

  const resourceType = type === 'video' ? 'video' : 'image';
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  const form = new FormData();

  if (typeof source === 'string') {
    form.append('file', source);
  } else {
    const finalBlob = type === 'image' ? await downscaleIfNeeded(source) : source;
    form.append('file', finalBlob);
  }

  form.append('upload_preset', UPLOAD_PRESET);
  if (API_KEY) {
    form.append('api_key', API_KEY);
  }
  form.append('folder', folder);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed with status ${res.status} ${errorText}`);
  }

  const result = (await res.json()) as CloudinaryResult;
  return result;
}

export function getOptimizedImageUrl(
  url: string,
  variant: 'hero' | 'step' | 'thumb'
): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  let transform = 'w_1200,c_limit,f_auto,q_80,fl_strip_profile';
  if (variant === 'step') {
    transform = 'w_800,c_limit,f_auto,q_80,fl_strip_profile';
  } else if (variant === 'thumb') {
    transform = 'w_320,c_fill,ar_16:10,f_auto,q_80,fl_strip_profile';
  }

  return url.replace('/upload/', `/upload/${transform}/`);
}

export const cloudinaryService: CloudinaryServiceAPI = {
  uploadAsset
};
