// Pure helpers for YouTube resumable uploads, shared by the browser uploader
// (lib/publish/youtubeUpload.ts) and the session/chunk routes. No DOM, no Next.js,
// no relative runtime imports, so node --experimental-strip-types can test it.

/** YouTube requires every chunk except the last to be a multiple of 256 KiB. */
export const CHUNK_GRANULARITY = 256 * 1024;
/** Direct browser→Google chunks. */
export const DIRECT_CHUNK_BYTES = 8 * 1024 * 1024;
/** Relay chunks must fit under Vercel's ~4.5 MB function request body limit. */
export const RELAY_CHUNK_BYTES = 4 * 1024 * 1024;
/** YouTube's own per-file limit (256 GB); the server only sees the declared size. */
export const YOUTUBE_MAX_UPLOAD_BYTES = 256 * 1024 * 1024 * 1024;
/** Google keeps resumable sessions for about a week. */
export const RESUMABLE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ChunkPlan {
  start: number;
  /** Exclusive. */
  end: number;
  contentRange: string;
}

export function isValidChunkSize(chunkSize: number): boolean {
  return Number.isInteger(chunkSize) && chunkSize > 0 && chunkSize % CHUNK_GRANULARITY === 0;
}

/** The next chunk to send from `offset`, or null when every byte has been sent. */
export function planChunk(offset: number, total: number, chunkSize: number): ChunkPlan | null {
  if (!isValidChunkSize(chunkSize)) throw new RangeError('Chunk size must be a positive multiple of 256 KiB');
  if (!Number.isInteger(total) || total <= 0) throw new RangeError('Total size must be a positive integer');
  if (!Number.isInteger(offset) || offset < 0 || offset > total) throw new RangeError('Offset out of range');
  if (offset === total) return null;
  const end = Math.min(offset + chunkSize, total);
  return { start: offset, end, contentRange: `bytes ${offset}-${end - 1}/${total}` };
}

/** `Content-Range` for a status query that asks how many bytes Google has. */
export function statusQueryRange(total: number): string {
  return `bytes */${total}`;
}

/**
 * Bytes Google has stored, from a 308 response's `Range` header ("bytes=0-1234" →
 * 1235). A 308 without `Range` means nothing has been stored yet. Returns null for
 * a malformed header so callers can fall back to a status query.
 */
export function receivedFromRangeHeader(range: string | null): number | null {
  if (range === null || range.trim() === '') return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) return null;
  return Number(match[1]) + 1;
}

export type ParsedContentRange =
  | { kind: 'chunk'; start: number; end: number; total: number }
  | { kind: 'query'; total: number };

/** Parses the `Content-Range` the relay accepts. `end` is inclusive. */
export function parseContentRange(header: string | null): ParsedContentRange | null {
  if (!header) return null;
  const query = /^bytes \*\/(\d+)$/.exec(header.trim());
  if (query) {
    const total = Number(query[1]);
    return Number.isSafeInteger(total) && total > 0 ? { kind: 'query', total } : null;
  }
  const chunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim());
  if (!chunk) return null;
  const [start, end, total] = [Number(chunk[1]), Number(chunk[2]), Number(chunk[3])];
  if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total) return null;
  return { kind: 'chunk', start, end, total };
}

/**
 * Validates a relay chunk against the stored session: the declared total must
 * match, the body length must match the range, and non-final chunks must be a
 * multiple of 256 KiB as YouTube requires. The start is not checked for alignment
 * because a resume continues from whatever byte Google reports.
 */
export function validateRelayChunk(range: ParsedContentRange, bodyBytes: number, sessionSize: number, maxChunkBytes: number): string | null {
  if (range.total !== sessionSize) return 'size_mismatch';
  if (range.kind === 'query') return bodyBytes === 0 ? null : 'unexpected_body';
  const length = range.end - range.start + 1;
  if (length !== bodyBytes) return 'length_mismatch';
  if (length > maxChunkBytes) return 'chunk_too_large';
  const isFinal = range.end === range.total - 1;
  if (!isFinal && length % CHUNK_GRANULARITY !== 0) return 'misaligned_chunk';
  return null;
}

export type UploadStep =
  | { kind: 'incomplete'; received: number }
  | { kind: 'complete' }
  | { kind: 'retry' }
  | { kind: 'expired' }
  | { kind: 'fatal' };

/** Classifies a Google resumable-upload response (chunk PUT or status query). */
export function classifyUploadResponse(status: number, rangeHeader: string | null): UploadStep {
  if (status === 200 || status === 201) return { kind: 'complete' };
  if (status === 308) {
    const received = receivedFromRangeHeader(rangeHeader);
    return received === null ? { kind: 'retry' } : { kind: 'incomplete', received };
  }
  // 404/410: the session is gone (expired or cancelled); a new one is required.
  if (status === 404 || status === 410) return { kind: 'expired' };
  if (isRetryableStatus(status)) return { kind: 'retry' };
  return { kind: 'fatal' };
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 8, baseDelayMs: 1000, maxDelayMs: 32_000 };

/**
 * Delay before retry number `attempt` (1-based): exponential with "equal jitter"
 * (half fixed, half random) so many tabs do not retry in lockstep. Returns null once
 * the attempt budget is spent.
 */
export function retryDelayMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY, random: () => number = Math.random): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > policy.maxAttempts) return null;
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Google's resumable session URLs; anything else must never be stored or proxied. */
export function isYouTubeUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.googleapis.com'
      && url.pathname.startsWith('/upload/youtube/v3/videos') && url.searchParams.has('upload_id');
  } catch { return false; }
}

export function isValidUploadId(value: string | null): value is string {
  return !!value && /^[a-f0-9]{32}$/.test(value);
}

export function isValidUploadSize(size: unknown): size is number {
  return typeof size === 'number' && Number.isSafeInteger(size) && size > 0 && size <= YOUTUBE_MAX_UPLOAD_BYTES;
}

// ── Resume records (persisted in localStorage by the browser uploader) ─────────

export interface ResumeRecord {
  uploadId: string;
  uploadUrl: string;
  size: number;
  name: string;
  lastModified: number;
  /** Hash of the file's first and last MiB plus its size; guards against resuming different bytes. */
  fingerprint: string;
  contentType: string;
  createdAt: number;
}

export function isResumeRecord(value: unknown): value is ResumeRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.uploadId === 'string' && isValidUploadId(r.uploadId)
    && typeof r.uploadUrl === 'string' && isYouTubeUploadUrl(r.uploadUrl)
    && isValidUploadSize(r.size) && typeof r.name === 'string'
    && typeof r.lastModified === 'number' && typeof r.fingerprint === 'string'
    && typeof r.contentType === 'string' && typeof r.createdAt === 'number';
}

/** Parses stored JSON, dropping malformed and expired records. */
export function parseResumeRecords(raw: string | null, nowMs: number): ResumeRecord[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const maxAgeMs = RESUMABLE_SESSION_TTL_SECONDS * 1000;
  return parsed.filter(isResumeRecord).filter((r) => nowMs - r.createdAt < maxAgeMs);
}

/** Candidate records for a file, before its fingerprint is checked. */
export function findResumeCandidate(records: ResumeRecord[], file: { name: string; size: number }): ResumeRecord | null {
  return records.filter((r) => r.name === file.name && r.size === file.size).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

// ── KV keys (server) ───────────────────────────────────────────────────────────

/** Resumable session owned by one oauth_session; holds the Google upload URL. */
export function resumableSessionKey(sessionId: string, uploadId: string): string {
  return `youtube:resumable:${sessionId}:${uploadId}`;
}

/** Ownership record checked by the status and thumbnail routes. */
export function uploadOwnershipKey(sessionId: string, videoId: string): string {
  return `youtube:upload:${sessionId}:${videoId}`;
}

export const UPLOAD_OWNERSHIP_TTL_SECONDS = 60 * 60 * 24;

export interface StoredResumableSession {
  uploadUrl: string;
  size: number;
  contentType: string;
  createdAt: number;
  videoId?: string;
}
