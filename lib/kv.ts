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

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  if (!isKVConfigured()) return false;
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, value);
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
