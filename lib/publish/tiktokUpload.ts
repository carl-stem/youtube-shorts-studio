// Browser-side TikTok inbox upload (FILE_UPLOAD).
//
// 1. POST { size, contentType } to /api/upload/tiktok/init → { publishId, uploadUrl, chunk plan }.
// 2. PUT each chunk straight to TikTok's upload_url (206 = continue, 201 = done).
//    TikTok chunks are at least 5 MB, which a Vercel function body cannot carry,
//    so there is no general relay. If the browser blocks the first direct PUT
//    (CORS) and the whole video is ≤ 4 MiB, it goes through /api/upload/tiktok/chunk;
//    larger videos fail with a clear message.
// TikTok has no "how many bytes do you have" query, so a failed chunk is resent
// whole after a backoff; the upload_url expires after one hour.

import { retryDelayMs } from './resumable';
import { TIKTOK_RELAY_MAX_BYTES, classifyTikTokChunkResponse, tiktokChunkRange, type TikTokChunkPlan } from './tiktokChunks';
import { UploadError, type TransferMode, type UploadOptions } from './youtubeUpload';

export interface TikTokUploadResult {
  publishId: string;
  mode: TransferMode;
}

interface InitResponse {
  publishId?: string;
  uploadUrl?: string;
  contentType?: string;
  chunkSize?: number;
  totalChunkCount?: number;
  error?: string;
  code?: string;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function cancelled(): UploadError {
  return new UploadError('Upload stopped. TikTok uploads cannot be resumed; publish again to start over.', 'cancelled');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function relayWholeFile(file: Blob, publishId: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`/api/upload/tiktok/chunk?publishId=${encodeURIComponent(publishId)}`, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes 0-${file.size - 1}/${file.size}`, 'Content-Type': 'application/octet-stream' },
    body: file,
    signal,
  });
  if (response.ok) return;
  const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
  throw new UploadError(data.error || 'TikTok did not accept the upload.', data.code || 'upload_failed');
}

export async function uploadToTikTok(file: File, options: UploadOptions = {}): Promise<TikTokUploadResult> {
  const { signal, onProgress } = options;
  if (file.size === 0) throw new UploadError('The selected export is empty. Export the clip again before uploading.', 'missing_video');
  const initRes = await fetch('/api/upload/tiktok/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: file.size, contentType: file.type }),
    signal,
  });
  const init = await initRes.json().catch((): InitResponse => ({})) as InitResponse;
  if (!initRes.ok || !init.publishId || !init.uploadUrl || !init.chunkSize || !init.totalChunkCount) {
    throw new UploadError(init.error || 'TikTok did not accept the upload request.', init.code || 'upload_failed');
  }
  const { publishId, uploadUrl } = init;
  const plan: TikTokChunkPlan = { videoSize: file.size, chunkSize: init.chunkSize, totalChunkCount: init.totalChunkCount };
  const contentType = init.contentType || 'video/mp4';
  let directWorked = false;
  const report = (sentBytes: number, retryInSeconds?: number) => onProgress?.({ sentBytes, totalBytes: file.size, mode: 'direct', retryInSeconds });

  for (let index = 0; index < plan.totalChunkCount; index += 1) {
    const range = tiktokChunkRange(plan, index);
    report(range.start);
    for (let failures = 0; ; ) {
      if (signal?.aborted) throw cancelled();
      let status: number;
      try {
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType, 'Content-Range': range.contentRange },
          body: file.slice(range.start, range.end),
          signal,
          credentials: 'omit',
        });
        status = response.status;
        directWorked = true;
      } catch (error: unknown) {
        if (isAbort(error)) throw cancelled();
        if (!(error instanceof TypeError)) throw error;
        if (!directWorked) {
          // Never reached TikTok: most likely CORS. Only a tiny whole file can use the relay.
          if (file.size <= TIKTOK_RELAY_MAX_BYTES) {
            console.info('[tiktok upload] direct upload to TikTok was blocked; using the relay');
            onProgress?.({ sentBytes: 0, totalBytes: file.size, mode: 'relay' });
            await relayWholeFile(file, publishId, signal);
            onProgress?.({ sentBytes: file.size, totalBytes: file.size, mode: 'relay' });
            return { publishId, mode: 'relay' };
          }
          throw new UploadError('Your browser could not send this video straight to TikTok, and videos over 4 MB cannot go through Shorts Studio. Download the export and upload it in the TikTok app instead.', 'tiktok_direct_blocked');
        }
        status = 0; // network drop mid-upload: retry this chunk
      }
      const outcome = status === 0 ? 'retry' : classifyTikTokChunkResponse(status);
      if (outcome === 'done') { report(file.size); return { publishId, mode: 'direct' }; }
      if (outcome === 'next') break;
      if (outcome === 'expired') throw new UploadError('The TikTok upload link expired (they last one hour). Publish again to start over.', 'upload_session_expired');
      if (outcome === 'fatal') throw new UploadError('TikTok rejected the upload. Check the TikTok app before retrying.', 'upload_rejected');
      failures += 1;
      const delay = retryDelayMs(failures);
      if (delay === null) throw new UploadError('The connection kept dropping. Publish again to start over.', 'upload_interrupted');
      report(range.start, Math.ceil(delay / 1000));
      await sleep(delay, signal);
    }
  }
  // Every chunk returned 206 but none 201: TikTok did not confirm the final chunk.
  throw new UploadError('TikTok did not confirm the upload finished. Check the TikTok app before retrying.', 'upload_unconfirmed');
}
