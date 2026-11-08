/**
 * Image downscaling and AVIF/WebP transcoding utility.
 * Compresses raw high-resolution camera originals (often 5-15 MB)
 * down to ~150-300 KB AVIF/WebP blobs before local persistence or Cloudinary upload.
 */

let isAvifCanvasSupported: boolean | null = null;

async function checkAvifCanvasSupport(): Promise<boolean> {
  if (isAvifCanvasSupported !== null) return isAvifCanvasSupported;
  if (typeof document === 'undefined') {
    isAvifCanvasSupported = false;
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/avif', 0.8);
    });
    isAvifCanvasSupported = !!(blob && blob.type === 'image/avif');
  } catch {
    isAvifCanvasSupported = false;
  }
  return isAvifCanvasSupported;
}

export interface OptimizeImageOptions {
  maxDimension?: number;
  quality?: number;
  preferredMimeType?: 'image/avif' | 'image/webp' | 'image/jpeg';
}

/**
 * Downscales an image blob/file so its longest dimension does not exceed maxDimension,
 * and encodes it as a compressed AVIF (or WebP fallback) File with proper extension.
 */
export async function transcodeToAvifBlob(
  source: File | Blob,
  options: OptimizeImageOptions = {}
): Promise<File | Blob> {
  const { maxDimension = 1920, quality = 0.85 } = options;

  // If running in SSR or unsupported environment, return source
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return source;
  }

  // Do not process SVG or non-image assets
  if (source.type === 'image/svg+xml' || source.type.startsWith('video/')) {
    return source;
  }

  let imgBitmap: ImageBitmap | HTMLImageElement | null = null;
  let width = 0;
  let height = 0;

  try {
    if (typeof createImageBitmap === 'function') {
      imgBitmap = await createImageBitmap(source);
      width = imgBitmap.width;
      height = imgBitmap.height;
    } else {
      const url = URL.createObjectURL(source);
      imgBitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(imgBitmap.src);
      width = imgBitmap.naturalWidth;
      height = imgBitmap.naturalHeight;
    }

    if (!width || !height) {
      return source;
    }

    // If source is already AVIF (or WebP fallback when AVIF is unsupported) and within max dimensions, skip re-transcoding
    const supportsAvif = await checkAvifCanvasSupport();
    const isTargetMime = (supportsAvif && source.type === 'image/avif') || (!supportsAvif && source.type === 'image/webp');
    if (isTargetMime && width <= maxDimension && height <= maxDimension) {
      if ('close' in imgBitmap && typeof imgBitmap.close === 'function') {
        imgBitmap.close();
      }
      return source;
    }

    // Calculate downscaled dimensions maintaining aspect ratio
    let targetWidth = width;
    let targetHeight = height;

    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        targetWidth = maxDimension;
        targetHeight = Math.round((height * maxDimension) / width);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round((width * maxDimension) / height);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;

    // High quality downscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgBitmap, 0, 0, targetWidth, targetHeight);

    // Clean up bitmap
    if ('close' in imgBitmap && typeof imgBitmap.close === 'function') {
      imgBitmap.close();
    }

    // Determine target format: AVIF first, then WebP, then JPEG
    let targetFormat = supportsAvif ? 'image/avif' : 'image/webp';
    let fileExt = supportsAvif ? 'avif' : 'webp';

    let outputBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, targetFormat, quality);
    });

    // Fallback check if browser failed export
    if (!outputBlob || outputBlob.type !== targetFormat) {
      targetFormat = 'image/webp';
      fileExt = 'webp';
      outputBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, targetFormat, quality);
      });
    }

    if (!outputBlob || outputBlob.type !== targetFormat) {
      targetFormat = 'image/jpeg';
      fileExt = 'jpg';
      outputBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, targetFormat, quality);
      });
    }

    if (!outputBlob) return source;

    // Base name preservation
    const origName = (source instanceof File ? source.name : 'upload').replace(/\.[^/.]+$/, '');
    const finalFilename = `${origName}.${fileExt}`;

    return new File([outputBlob], finalFilename, {
      type: outputBlob.type,
      lastModified: Date.now()
    });
  } catch (err) {
    console.warn('[imageOptimizer] Transcode failed, keeping original source', err);
    return source;
  }
}

/**
 * Computes a 64-bit difference hash (dHash) from an image source.
 * Difference Hash is format-agnostic (yields near-identical hashes across JPG, PNG, WebP, AVIF)
 * and resistant to minor scaling or compression artifacts.
 * Returns a 16-character hexadecimal string.
 */
export async function computeImageDHash(source: File | Blob): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  let imgBitmap: ImageBitmap | HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      imgBitmap = await createImageBitmap(source);
    } else {
      const url = URL.createObjectURL(source);
      imgBitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(imgBitmap.src);
    }

    // 9 columns x 8 rows to compute 8 x 8 = 64 horizontal gradient bits
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(imgBitmap, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8).data;

    if ('close' in imgBitmap && typeof imgBitmap.close === 'function') {
      imgBitmap.close();
    }

    // Compute luminance for each of the 72 pixels
    const lums: number[] = new Array(72);
    for (let i = 0; i < 72; i++) {
      const offset = i * 4;
      // Standard Rec. 601 luma formula
      lums[i] = 0.299 * imgData[offset] + 0.587 * imgData[offset + 1] + 0.114 * imgData[offset + 2];
    }

    // 64 bit comparisons (8 rows, 8 columns each: left > right)
    let hexResult = '';
    let nibble = 0;
    let bitCount = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const leftIdx = row * 9 + col;
        const rightIdx = leftIdx + 1;
        const bit = lums[leftIdx] > lums[rightIdx] ? 1 : 0;

        nibble = (nibble << 1) | bit;
        bitCount++;

        if (bitCount === 4) {
          hexResult += nibble.toString(16);
          nibble = 0;
          bitCount = 0;
        }
      }
    }

    return hexResult.padStart(16, '0');
  } catch (err) {
    console.warn('[imageOptimizer] Failed to compute dHash', err);
    return null;
  }
}

/**
 * Computes the Hamming distance (number of differing bits) between two 16-char hex dHashes.
 * A distance <= 3 out of 64 bits corresponds to ~95%+ visual similarity.
 */
export function computeHammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;

  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    const valA = parseInt(hexA[i], 16);
    const valB = parseInt(hexB[i], 16);
    if (isNaN(valA) || isNaN(valB)) return 64;

    let xor = valA ^ valB;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}
