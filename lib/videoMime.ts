// Video MIME normalization shared by the upload routes. Pure, no imports.
// lib/youtubeMetadata.ts keeps an identical inline split (it must stay free of
// relative runtime imports for the Node tests); scripts/test-video-mime.mjs pins
// that both agree.

export const UPLOAD_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

/**
 * MediaRecorder blobs carry codec parameters (e.g. `video/webm;codecs=vp9,opus`);
 * providers want the base type. An empty type (some browsers) is treated as MP4.
 */
export function normalizeVideoMime(raw: string | null | undefined): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase() || 'video/mp4';
}

export function isUploadableVideoMime(raw: string | null | undefined): boolean {
  return (UPLOAD_VIDEO_MIME_TYPES as readonly string[]).includes(normalizeVideoMime(raw));
}
