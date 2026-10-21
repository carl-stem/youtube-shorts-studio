// Fixed-window rate limiting and Whisper daily metering.
// Pure logic: storage is injected so it can be unit-tested without KV or Next.js.
// Keep this file free of relative runtime imports (node --experimental-strip-types
// cannot resolve extensionless specifiers in tests).

import { createHash } from 'node:crypto';

export interface CounterStore {
  /** Atomically adds `amount` to `key`; the key expires `ttlSeconds` after it is created. Returns the new total, or null when storage is unavailable. */
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null>;
  /** Returns the current total (0 when the key is absent), or null when storage is unavailable. */
  get(key: string): Promise<number | null>;
}

export interface WindowResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/** Counts one request in the current window. Returns null when storage is unavailable. */
export async function hitFixedWindow(
  store: CounterStore,
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
  nowMs: number = Date.now(),
): Promise<WindowResult | null> {
  const windowIndex = Math.floor(nowMs / 1000 / windowSeconds);
  const count = await store.incrBy(`ratelimit:${bucket}:${id}:${windowIndex}`, 1, windowSeconds);
  if (count === null) return null;
  const windowEndMs = (windowIndex + 1) * windowSeconds * 1000;
  return { allowed: count <= limit, count, limit, retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)) };
}

/**
 * Anonymous caller identifier. `verifiedSessionId` must only be passed once the
 * oauth_session cookie has been checked against KV; otherwise a caller could mint
 * fresh quota by sending random cookie values. The session id is hashed so bearer
 * values never appear in KV key names.
 */
export function clientIdentifier(input: {
  verifiedSessionId?: string | null;
  forwardedFor?: string | null;
  realIp?: string | null;
}): string {
  if (input.verifiedSessionId) {
    return `s:${createHash('sha256').update(input.verifiedSessionId).digest('hex').slice(0, 32)}`;
  }
  const ip = input.forwardedFor?.split(',')[0]?.trim() || input.realIp?.trim();
  return `ip:${ip || 'unknown'}`;
}

export type LimitsMode = 'enforce' | 'skip' | 'refuse';

/** Production fails closed without KV; development runs without limits. */
export function limitsMode(kvConfigured: boolean, nodeEnv: string | undefined): LimitsMode {
  if (kvConfigured) return 'enforce';
  return nodeEnv === 'production' ? 'refuse' : 'skip';
}

// ── Whisper daily minutes ────────────────────────────────────────────────────

export const DEFAULT_WHISPER_DAILY_MINUTES = 60;

export function parseDailyMinutes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_WHISPER_DAILY_MINUTES;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_WHISPER_DAILY_MINUTES;
}

/**
 * Daily cap for one identifier. Today every identifier gets the env default; a paid
 * tier can look up a per-identifier override here without changing callers.
 */
export async function getDailyCapMinutes(_id: string): Promise<number> {
  return parseDailyMinutes(process.env.WHISPER_DAILY_MINUTES);
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function whisperUsageKey(id: string, nowMs: number): string {
  return `usage:whisper:seconds:${id}:${utcDay(nowMs)}`;
}

/** Usage keys outlive their UTC day slightly so late reads near midnight still resolve. */
const USAGE_TTL_SECONDS = 2 * 24 * 60 * 60;

export interface WhisperUsage {
  usedSeconds: number;
  capSeconds: number;
  remainingSeconds: number;
}

export async function getWhisperUsage(
  store: CounterStore,
  id: string,
  capMinutes: number,
  nowMs: number = Date.now(),
): Promise<WhisperUsage | null> {
  const used = await store.get(whisperUsageKey(id, nowMs));
  if (used === null) return null;
  const capSeconds = Math.round(capMinutes * 60);
  return { usedSeconds: used, capSeconds, remainingSeconds: Math.max(0, capSeconds - used) };
}

/** OpenAI reports audio duration in fractional seconds; meter whole seconds, rounding up. */
export function billableSeconds(durationSeconds: number | undefined): number {
  return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.ceil(durationSeconds)
    : 0;
}

export async function recordWhisperUsage(
  store: CounterStore,
  id: string,
  seconds: number,
  nowMs: number = Date.now(),
): Promise<number | null> {
  if (seconds <= 0) return store.get(whisperUsageKey(id, nowMs));
  return store.incrBy(whisperUsageKey(id, nowMs), seconds, USAGE_TTL_SECONDS);
}
