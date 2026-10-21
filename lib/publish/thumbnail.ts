// Custom thumbnail preparation: scale the picked image down and re-encode it as a
// JPEG no larger than YouTube's 2 MB limit. Size math is pure; the canvas part only
// runs in the browser.

export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
/** Long edge cap; YouTube recommends 1280×720 for 16:9. */
export const THUMBNAIL_LONG_EDGE = 1280;
export const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.5] as const;
export const THUMBNAIL_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Scales down (never up) so the long edge fits `maxEdge`. */
export function fitLongEdge(width: number, height: number, maxEdge: number = THUMBNAIL_LONG_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new RangeError('Image has no size');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Browser only. Throws with a plain-language message when the image cannot be used. */
export async function prepareThumbnail(file: File): Promise<Blob> {
  if (!(THUMBNAIL_INPUT_TYPES as readonly string[]).includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be read. Try another file.'); }
  try {
    let { width, height } = fitLongEdge(bitmap.width, bitmap.height);
    // Shrink further only if even low JPEG quality is over the limit.
    for (let pass = 0; pass < 3; pass += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot prepare thumbnails.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob && blob.size <= MAX_THUMBNAIL_BYTES) return blob;
      }
      ({ width, height } = fitLongEdge(width, height, Math.round(Math.max(width, height) * 0.75)));
    }
    throw new Error('This image is too detailed to fit under 2 MB. Try a simpler image.');
  } finally {
    bitmap.close();
  }
}
