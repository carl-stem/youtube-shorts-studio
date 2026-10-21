// Browser-side YouTube resumable upload.
//
// 1. POST metadata to /api/upload/youtube/session → { uploadId, uploadUrl }.
// 2. Try PUTting the first 8 MiB chunk straight to the Google upload URL. If the
//    browser throws a TypeError (CORS refused or network), switch to the
//    session-scoped relay (/api/upload/youtube/chunk) with 4 MiB chunks, which fit
//    under Vercel's ~4.5 MB body limit.
// 3. After any failure, ask how many bytes Google has (`bytes */total` via the relay,
//    which can always read the Range header) and continue from there with
//    exponential backoff.
// 4. Completion is confirmed through the relay so the server records ownership of
//    the videoId for the status and thumbnail routes.
//
// A small resume record lives in localStorage so a reload can continue the same
// upload when the same file is chosen again.

import {
  DIRECT_CHUNK_BYTES, RELAY_CHUNK_BYTES, classifyUploadResponse, findResumeCandidate, parseResumeRecords,
  planChunk, retryDelayMs, statusQueryRange, type ChunkPlan, type ResumeRecord,
} from './resumable';

export type TransferMode = 'direct' | 'relay';

export interface YouTubeDraft {
  title: string;
  description: string;
  tags: string;
  privacy: 'public' | 'unlisted' | 'private';
  /** ISO 8601 with offset, or null. */
  publishAt: string | null;
  categoryId: string;
  madeForKids: boolean;
}

export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
  mode: TransferMode;
  /** Set while waiting to retry after a network or server error. */
  retryInSeconds?: number;
}

export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
  shortsUrl: string;
  mode: TransferMode;
  /** False when the server could not record ownership, so status checks will not work. */
  tracked: boolean;
}

export class UploadError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

const STORAGE_KEY = 'shorts-studio:youtube-resumable';
const FINGERPRINT_SAMPLE = 1024 * 1024;

// ── Resume records ─────────────────────────────────────────────────────────────

function readRecords(): ResumeRecord[] {
  try { return parseResumeRecords(window.localStorage.getItem(STORAGE_KEY), Date.now()); } catch { return []; }
}

function writeRecords(records: ResumeRecord[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* storage blocked or full: resume is best-effort */ }
}

function saveRecord(record: ResumeRecord): void {
  writeRecords([...readRecords().filter((r) => r.uploadId !== record.uploadId), record]);
}

export function forgetResumableUpload(uploadId: string): void {
  writeRecords(readRecords().filter((r) => r.uploadId !== uploadId));
}

/** An unfinished upload for a file with this name and size, if one was saved. */
export function findResumableUpload(file: { name: string; size: number }): ResumeRecord | null {
  return findResumeCandidate(readRecords(), file);
}

/** SHA-256 of the first and last MiB plus the size, so resume never mixes different bytes. */
async function fileFingerprint(file: Blob): Promise<string> {
  const head = file.slice(0, FINGERPRINT_SAMPLE);
  const tail = file.slice(Math.max(0, file.size - FINGERPRINT_SAMPLE));
  const sizeBytes = new TextEncoder().encode(String(file.size));
  const data = await new Blob([head, tail, sizeBytes]).arrayBuffer();
  if (!globalThis.crypto?.subtle) return `size:${file.size}:${data.byteLength}`;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Transport ─────────────────────────────────────────────────────────────────

type Step =
  | { kind: 'incomplete'; received: number }
  | { kind: 'complete'; videoId: string | null; tracked: boolean }
  | { kind: 'resync' }
  | { kind: 'retry' };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function cancelled(): UploadError {
  return new UploadError('Upload paused. You can resume it later by publishing the same file again.', 'cancelled');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface RelayBody {
  state?: 'incomplete' | 'complete';
  received?: number;
  videoId?: string;
  tracked?: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
}

/** Sends a chunk (or, with no plan, a status query) through the relay. */
async function relay(record: ResumeRecord, plan: ChunkPlan | null, file: Blob, signal?: AbortSignal): Promise<Step> {
  const response = await fetch(`/api/upload/youtube/chunk?uploadId=${encodeURIComponent(record.uploadId)}`, {
    method: 'PUT',
    headers: { 'Content-Range': plan ? plan.contentRange : statusQueryRange(record.size), 'Content-Type': 'application/octet-stream' },
    body: plan ? file.slice(plan.start, plan.end) : undefined,
    signal,
    cache: 'no-store',
  });
  const data = await response.json().catch((): RelayBody => ({})) as RelayBody;
  if (response.ok && data.state === 'incomplete' && typeof data.received === 'number') return { kind: 'incomplete', received: data.received };
  if (response.ok && data.state === 'complete' && typeof data.videoId === 'string') return { kind: 'complete', videoId: data.videoId, tracked: data.tracked !== false };
  if (response.status === 410) {
    forgetResumableUpload(record.uploadId);
    throw new UploadError(data.error || 'This upload expired. Start it again.', data.code || 'upload_session_expired');
  }
  if (response.status === 429 || response.status >= 500 || data.retryable) return { kind: 'retry' };
  throw new UploadError(data.error || 'The upload could not continue.', data.code || 'upload_failed');
}

/** Sends a chunk straight to Google. Throws TypeError when CORS or the network blocks it. */
async function direct(record: ResumeRecord, plan: ChunkPlan, file: Blob, signal?: AbortSignal): Promise<Step> {
  const response = await fetch(record.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Range': plan.contentRange, 'Content-Type': record.contentType },
    body: file.slice(plan.start, plan.end),
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  // Google may not expose `Range` to scripts; without it ask the relay instead of guessing.
  const range = response.headers.get('range');
  if (response.status === 308 && range === null) return { kind: 'resync' };
  const step = classifyUploadResponse(response.status, range);
  if (step.kind === 'incomplete') return step;
  if (step.kind === 'complete') {
    const payload: unknown = await response.json().catch(() => null);
    const videoId = payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string' ? payload.id : null;
    return { kind: 'complete', videoId, tracked: false };
  }
  if (step.kind === 'retry') return { kind: 'retry' };
  if (step.kind === 'expired') {
    forgetResumableUpload(record.uploadId);
    throw new UploadError('YouTube closed this upload session. Start the upload again.', 'upload_session_expired');
  }
  throw new UploadError('YouTube rejected the upload. Check YouTube Studio before retrying.', 'upload_rejected');
}

async function run(file: Blob, record: ResumeRecord, resyncFirst: boolean, options: UploadOptions): Promise<YouTubeUploadResult> {
  const { signal, onProgress } = options;
  let mode: TransferMode = 'direct';
  let directWorked = false;
  let offset = 0;
  let failures = 0;
  let pending: Step | null = resyncFirst ? { kind: 'resync' } : null;
  const report = (extra: Partial<UploadProgress> = {}) => onProgress?.({ sentBytes: offset, totalBytes: record.size, mode, ...extra });
  const finish = (videoId: string, tracked: boolean): YouTubeUploadResult => {
    forgetResumableUpload(record.uploadId);
    offset = record.size;
    report();
    return { videoId, tracked, mode, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, shortsUrl: `https://www.youtube.com/shorts/${videoId}` };
  };
  report();

  for (;;) {
    if (signal?.aborted) throw cancelled();
    let step: Step;
    if (pending) { step = pending; pending = null; }
    else {
      const plan = planChunk(offset, record.size, mode === 'direct' ? DIRECT_CHUNK_BYTES : RELAY_CHUNK_BYTES);
      try {
        if (!plan) step = { kind: 'resync' };
        else if (mode === 'direct') { step = await direct(record, plan, file, signal); directWorked = true; }
        else step = await relay(record, plan, file, signal);
      } catch (error: unknown) {
        if (isAbort(error)) throw cancelled();
        if (!(error instanceof TypeError)) throw error;
        if (mode === 'direct' && !directWorked) {
          // Direct PUT failed before Google ever answered the browser: most likely CORS. Use the relay from here on.
          console.info('[youtube upload] direct upload to Google was blocked; switching to the relay');
          mode = 'relay';
          step = { kind: 'resync' };
        } else {
          step = { kind: 'retry' };
        }
      }
    }

    if (step.kind === 'incomplete') {
      offset = step.received;
      failures = 0;
      report();
      continue;
    }
    if (step.kind === 'complete') {
      let { videoId, tracked } = step;
      if (!tracked) {
        // Direct completion: confirm through the relay so the server records ownership.
        try {
          const confirmed = await relay(record, null, file, signal);
          if (confirmed.kind === 'complete') ({ videoId, tracked } = confirmed);
        } catch (error: unknown) {
          if (isAbort(error)) throw cancelled();
          console.warn('[youtube upload] could not confirm completion with the server', error);
        }
      }
      if (!videoId) throw new UploadError('YouTube finished the upload but did not return a video ID. Check YouTube Studio.', 'provider_error');
      return finish(videoId, tracked);
    }
    if (step.kind === 'retry') {
      failures += 1;
      const delay = retryDelayMs(failures);
      if (delay === null) throw new UploadError('The connection kept dropping. Your progress is saved; publish the same file again to resume.', 'upload_interrupted');
      report({ retryInSeconds: Math.ceil(delay / 1000) });
      await sleep(delay, signal);
    }
    // 'retry' and 'resync' both re-learn the received offset (via the relay, which can
    // always read Google's Range header) before sending more bytes.
    try {
      pending = await relay(record, null, file, signal);
    } catch (error: unknown) {
      if (isAbort(error)) throw cancelled();
      if (!(error instanceof TypeError)) throw error;
      pending = { kind: 'retry' };
    }
    if (pending.kind === 'resync') pending = { kind: 'retry' };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadToYouTube(file: File, draft: YouTubeDraft, options: UploadOptions = {}): Promise<YouTubeUploadResult> {
  if (file.size === 0) throw new UploadError('The selected export is empty. Export the clip again before uploading.', 'missing_video');
  const fingerprint = await fileFingerprint(file);
  const response = await fetch('/api/upload/youtube/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...draft, size: file.size, contentType: file.type }),
    signal: options.signal,
  });
  const data = await response.json().catch(() => ({})) as { uploadId?: string; uploadUrl?: string; contentType?: string; error?: string; code?: string };
  if (!response.ok || !data.uploadId || !data.uploadUrl) {
    throw new UploadError(data.error || 'YouTube did not accept the upload request.', data.code || 'upload_failed');
  }
  const record: ResumeRecord = {
    uploadId: data.uploadId,
    uploadUrl: data.uploadUrl,
    size: file.size,
    name: file.name,
    lastModified: file.lastModified,
    fingerprint,
    contentType: data.contentType || file.type,
    createdAt: Date.now(),
  };
  saveRecord(record);
  return run(file, record, false, options);
}

/** Continues a saved upload. The file must have the same bytes as the original. */
export async function resumeYouTubeUpload(file: File, record: ResumeRecord, options: UploadOptions = {}): Promise<YouTubeUploadResult> {
  if (file.size !== record.size || await fileFingerprint(file) !== record.fingerprint) {
    throw new UploadError('This export is not the same file that was uploading. Start a new upload instead.', 'resume_mismatch');
  }
  // Start from Google's view of progress; direct is tried again for the remaining chunks.
  return run(file, record, true, options);
}
