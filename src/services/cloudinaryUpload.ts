import { loadBlob } from './localMediaStore';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

/**
 * Perform client-side canvas pre-flight image downscaling:
 * 2560px bounding box, max JPEG quality 0.92
 */
export async function preflightProcessImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const maxDim = 2560;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (resBlob) => resolve(resBlob || blob),
      'image/jpeg',
      0.92
    );
  });
}

/**
 * Upload a processed image blob to Cloudinary unsigned upload preset
 */
export async function uploadToCloudinary(
  blob: Blob,
  folder: 'recipes/images' | 'recipes/videos' = 'recipes/images'
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.warn('Cloudinary environment variables unset. Returning local object URL placeholder.');
    return URL.createObjectURL(blob);
  }

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudinary upload failed: ${errText}`);
  }

  const data = await res.json();
  return data.secure_url;
}

/**
 * Utility to process local IDB refs and upload them to Cloudinary
 */
export async function resolveAndUploadLocalRef(ref: string): Promise<string> {
  if (!ref.startsWith('idb:')) {
    return ref; // Already a URL or non-IDB ref
  }

  const blob = await loadBlob(ref);
  if (!blob) {
    throw new Error(`Local media blob not found for ref: ${ref}`);
  }

  const processedBlob = await preflightProcessImage(blob);
  return await uploadToCloudinary(processedBlob, 'recipes/images');
}
