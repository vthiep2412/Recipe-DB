import type {
  CloudinaryAssetType,
  CloudinaryResult,
  CloudinaryServiceAPI
} from '../types/cloud';

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string) || '';
const UPLOAD_PRESET = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string) || '';
const API_KEY = (import.meta.env.VITE_CLOUDINARY_API_KEY as string) || '';

export const STREAM_IMAGE_TRANSFORMATION = 'f_auto,q_auto:good,fl_strip_profile';

export function getStreamMasterUrl(url: string): string {
  return getOptimizedImageUrl(url);
}

export function getOptimizedImageUrl(
  url?: string | null,
  _variant?: 'hero' | 'step' | 'thumb' | 'card' | 'lightbox' | string
): string {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com') || !url.includes('/upload/')) {
    return url || '';
  }

  // Already transformed with the stream configuration
  if (url.includes(`/upload/${STREAM_IMAGE_TRANSFORMATION}/`)) {
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
      return `${url.slice(0, uploadIndex)}/upload/${STREAM_IMAGE_TRANSFORMATION}/${rest}`;
    }
  }

  return `${url.slice(0, uploadIndex)}/upload/${STREAM_IMAGE_TRANSFORMATION}/${afterUpload}`;
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

  form.append('file', source);
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
