/**
 * Prepares a captured/selected photo for local storage:
 * - honours EXIF orientation, downsizes to at most MAX_DIMENSION px,
 * - re-encodes as JPEG, which also removes EXIF metadata such as GPS location and device data.
 */
export const MAX_DIMENSION = 1600;
export const JPEG_QUALITY = 0.85;
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export interface ProcessedImage {
  data: ArrayBuffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export async function processImageFile(file: Blob): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('The image is larger than 40 MB.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('The selected file is not an image.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('The image could not be read. Use a JPEG or PNG photo.');
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available in this browser.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('The image could not be encoded.');
  return { data: await blob.arrayBuffer(), mimeType: 'image/jpeg', width, height };
}
