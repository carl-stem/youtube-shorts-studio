// Graceful wrapper — returns null when KV env vars are absent
// All server-side only

export function isKVConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!isKVConfigured()) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return await kv.get<T>(key);
  } catch { return null; }
}

// Atomically reads and removes a value; used for one-time OAuth state tokens.
export async function kvGetDel<T>(key: string): Promise<T | null> {
  if (!isKVConfigured()) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return await kv.getdel<T>(key);
  } catch { return null; }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  if (!isKVConfigured()) return false;
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, value);
    return true;
  } catch { return false; }
}

export async function kvSetWithExpiry(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  if (!isKVConfigured()) return false;
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, value, { ex: ttlSeconds });
    return true;
  } catch { return false; }
}

export async function kvDel(key: string): Promise<boolean> {
  if (!isKVConfigured()) return false;
  try {
    const { kv } = await import('@vercel/kv');
    await kv.del(key);
    return true;
  } catch { return false; }
}

// Atomically increments a counter. The expiry is set only by the call that created
// the key (total === amount), giving fixed windows without requiring EXPIRE NX support.
export async function kvIncrByWithExpiry(key: string, amount: number, ttlSeconds: number): Promise<number | null> {
  if (!isKVConfigured()) return null;
  try {
    const { kv } = await import('@vercel/kv');
    const total = await kv.incrby(key, amount);
    if (total === amount) await kv.expire(key, ttlSeconds);
    return total;
  } catch { return null; }
}

// Reads a numeric counter; 0 when absent, null when KV is unavailable or errors.
export async function kvGetCounter(key: string): Promise<number | null> {
  if (!isKVConfigured()) return null;
  try {
    const { kv } = await import('@vercel/kv');
    const value = await kv.get<number | string>(key);
    if (value === null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  } catch { return null; }
}
