import type {
  CloudinaryAssetType,
  CloudinaryResult,
  CloudinaryServiceAPI
} from '../types/cloud';

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string) || '';
const UPLOAD_PRESET = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string) || '';
const API_KEY = (import.meta.env.VITE_CLOUDINARY_API_KEY as string) || '';

export const STREAM_IMAGE_TRANSFORMATION = 'f_auto,q_auto:good,fl_strip_profile';

export type ImageVariant = 'hero' | 'step' | 'thumb' | 'card' | 'lightbox' | string;

export function getVariantTransformation(variant?: ImageVariant): string {
  switch (variant) {
    case 'hero':
      return 'w_1200,c_limit,f_auto,q_auto:good,fl_strip_profile';
    case 'step':
      return 'w_800,c_limit,f_auto,q_auto:good,fl_strip_profile';
    case 'card':
    case 'thumb':
      return 'w_400,c_fill,ar_16:10,f_auto,q_auto:good,fl_strip_profile';
    case 'lightbox':
      return 'w_1920,c_limit,f_auto,q_auto:good,fl_strip_profile';
    default:
      return 'w_1200,c_limit,f_auto,q_auto:good,fl_strip_profile';
  }
}

export function getStreamMasterUrl(url: string, variant?: ImageVariant): string {
  return getOptimizedImageUrl(url, variant);
}

export function getOptimizedImageUrl(
  url?: string | null,
  variant?: ImageVariant
): string {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com') || !url.includes('/upload/')) {
    return url || '';
  }

  const targetTransform = getVariantTransformation(variant);

  // Already transformed with the requested configuration
  if (url.includes(`/upload/${targetTransform}/`)) {
    return url;
  }

  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;

  const afterUpload = url.slice(uploadIndex + '/upload/'.length);

  // Check if afterUpload begins with an existing transformation segment
  const firstSlashIdx = afterUpload.indexOf('/');
  if (firstSlashIdx !== -1) {
    const firstSegment = afterUpload.slice(0, firstSlashIdx);
    const isTransformSegment =
      /^(w_|h_|c_|f_|q_|ar_|fl_|b_|e_|dpr_|co_|[a-z0-9_,]+)/i.test(firstSegment) &&
      !/^v\d+$/i.test(firstSegment) &&
      firstSegment !== 'recipes';

    if (isTransformSegment) {
      const rest = afterUpload.slice(firstSlashIdx + 1);
      return `${url.slice(0, uploadIndex)}/upload/${targetTransform}/${rest}`;
    }
  }

  return `${url.slice(0, uploadIndex)}/upload/${targetTransform}/${afterUpload}`;
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
  } else if (source instanceof File) {
    form.append('file', source, source.name);
  } else {
    // Blob without filename
    const ext = source.type === 'image/avif' ? 'avif' : source.type === 'image/webp' ? 'webp' : 'jpg';
    form.append('file', source, `upload.${ext}`);
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

export const cloudinaryService: CloudinaryServiceAPI = {
  uploadAsset
};
