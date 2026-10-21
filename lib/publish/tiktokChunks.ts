// TikTok Content Posting API FILE_UPLOAD chunk rules (Media Transfer Guide,
// developers.tiktok.com/doc/content-posting-api-media-transfer-guide):
// - each chunk is 5–64 MB, except the final chunk, which absorbs trailing bytes
//   (up to 128 MB);
// - total_chunk_count = floor(video_size / chunk_size), 1–1000 chunks;
// - a file smaller than one chunk is sent whole (chunk_size = video_size);
// - chunks are PUT sequentially with Content-Range; 206 = more expected,
//   201 = all received; video_size up to 4 GB.
// Pure; shared by the init route, the browser uploader and tests.

export const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const TIKTOK_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const TIKTOK_MAX_FINAL_CHUNK_BYTES = 128 * 1024 * 1024;
export const TIKTOK_MAX_CHUNKS = 1000;
export const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
/** Small enough for useful progress, large enough to keep requests few. */
export const TIKTOK_DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;
/** Largest whole file the app's relay can carry (Vercel body limit ~4.5 MB). */
export const TIKTOK_RELAY_MAX_BYTES = 4 * 1024 * 1024;
/** TikTok's upload_url expires one hour after init. */
export const TIKTOK_UPLOAD_URL_TTL_SECONDS = 60 * 60;

export interface TikTokChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

export function isValidTikTokVideoSize(size: unknown): size is number {
  return typeof size === 'number' && Number.isSafeInteger(size) && size > 0 && size <= TIKTOK_MAX_VIDEO_BYTES;
}

export function planTikTokChunks(videoSize: number, preferredChunk: number = TIKTOK_DEFAULT_CHUNK_BYTES): TikTokChunkPlan {
  if (!isValidTikTokVideoSize(videoSize)) throw new RangeError('Video size must be between 1 byte and 4 GB');
  if (preferredChunk < TIKTOK_MIN_CHUNK_BYTES || preferredChunk > TIKTOK_MAX_CHUNK_BYTES) throw new RangeError('Chunk size must be 5–64 MB');
  if (videoSize < preferredChunk) return { videoSize, chunkSize: videoSize, totalChunkCount: 1 };
  const totalChunkCount = Math.floor(videoSize / preferredChunk);
  if (totalChunkCount > TIKTOK_MAX_CHUNKS) throw new RangeError('Too many chunks');
  return { videoSize, chunkSize: preferredChunk, totalChunkCount };
}

/** Byte range of chunk `index` (0-based); the last chunk runs to the end of the file. */
export function tiktokChunkRange(plan: TikTokChunkPlan, index: number): { start: number; end: number; contentRange: string } {
  if (!Number.isInteger(index) || index < 0 || index >= plan.totalChunkCount) throw new RangeError('Chunk index out of range');
  const start = index * plan.chunkSize;
  const end = index === plan.totalChunkCount - 1 ? plan.videoSize : start + plan.chunkSize;
  return { start, end, contentRange: `bytes ${start}-${end - 1}/${plan.videoSize}` };
}

export type TikTokChunkOutcome = 'next' | 'done' | 'retry' | 'expired' | 'fatal';

export function classifyTikTokChunkResponse(status: number): TikTokChunkOutcome {
  if (status === 206) return 'next';
  if (status === 201) return 'done';
  if (status === 403 || status === 404) return 'expired';
  if (status === 429 || status >= 500) return 'retry';
  return 'fatal';
}

export function isTikTokUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.tiktokapis.com');
  } catch { return false; }
}

export function isValidTikTokPublishId(value: string | null): value is string {
  return !!value && /^[a-zA-Z0-9_.~-]{8,256}$/.test(value);
}

export function tiktokUploadKey(sessionId: string, publishId: string): string {
  return `tiktok:upload:${sessionId}:${publishId}`;
}

export function tiktokPublishKey(sessionId: string, publishId: string): string {
  return `tiktok:publish:${sessionId}:${publishId}`;
}

export interface StoredTikTokUpload {
  uploadUrl: string;
  videoSize: number;
  contentType: string;
}
