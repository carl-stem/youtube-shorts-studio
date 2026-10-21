// Route glue for same-origin checks and KV-backed rate limits. Server-side only.
// The window/limit logic lives in ./rateLimit so it stays unit-testable.

import { NextRequest, NextResponse } from 'next/server';
import { isKVConfigured, kvGet, kvGetCounter, kvIncrByWithExpiry } from './kv';
import { clientIdentifier, hitFixedWindow, limitsMode, type CounterStore } from './rateLimit';

export const kvCounterStore: CounterStore = { incrBy: kvIncrByWithExpiry, get: kvGetCounter };

// Same check as the upload/disconnect routes: a present Origin must be this origin.
export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin not allowed', code: 'origin_not_allowed' }, { status: 403 });
  return null;
}

async function identifyCaller(req: NextRequest): Promise<string> {
  const sessionId = req.cookies.get('oauth_session')?.value;
  const verified = sessionId && await kvGet<{ createdAt: number }>(`oauth:session:${sessionId}`) ? sessionId : null;
  return clientIdentifier({
    verifiedSessionId: verified,
    forwardedFor: req.headers.get('x-forwarded-for'),
    realIp: req.headers.get('x-real-ip'),
  });
}

export function limitsUnavailable(): NextResponse {
  return NextResponse.json({ error: 'Usage limits are unavailable right now. Try again later.', code: 'rate_limit_unavailable' }, { status: 503 });
}

/**
 * Returns `{ response }` to send immediately, or `{ id }` to continue. `id` is null
 * when limits are skipped (development without KV).
 */
export async function applyRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<{ response: NextResponse } | { id: string | null }> {
  const mode = limitsMode(isKVConfigured(), process.env.NODE_ENV);
  if (mode === 'skip') return { id: null };
  if (mode === 'refuse') return { response: limitsUnavailable() };
  const id = await identifyCaller(req);
  const result = await hitFixedWindow(kvCounterStore, bucket, id, limit, windowSeconds);
  // KV configured but failing: fail closed rather than run unmetered paid calls.
  if (!result) return { response: limitsUnavailable() };
  if (!result.allowed) {
    return {
      response: NextResponse.json(
        { error: `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`, code: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      ),
    };
  }
  return { id };
}
