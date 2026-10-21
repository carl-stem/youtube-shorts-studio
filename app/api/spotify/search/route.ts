import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../lib/apiGuard';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const id  = process.env.SPOTIFY_CLIENT_ID;
  const sec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !sec) throw new Error('Spotify credentials not configured');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Failed to get Spotify token');
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

export async function GET(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing q param' }, { status: 400 });
  const limited = await applyRateLimit(req, 'spotify-search', 30, 60);
  if ('response' in limited) return limited.response;
  // Checked up front so this stays a stable message the client recognises, not a caught exception.
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Spotify credentials not configured', code: 'not_configured' }, { status: 500 });
  }

  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=6&market=US`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Spotify search failed');
    const data = await res.json();

    const tracks = data.tracks.items.map((t: {
      id: string;
      name: string;
      artists: { name: string }[];
      album: { name: string; images: { url: string }[] };
      preview_url: string | null;
      external_urls: { spotify: string };
      duration_ms: number;
    }) => ({
      id:         t.id,
      title:      t.name,
      artist:     t.artists.map((a) => a.name).join(', '),
      album:      t.album.name,
      artUrl:     t.album.images[0]?.url ?? null,
      artMedium:  t.album.images[1]?.url ?? null,
      previewUrl: t.preview_url,
      spotifyUrl: t.external_urls.spotify,
      durationMs: t.duration_ms,
    }));

    return NextResponse.json({ tracks });
  } catch (err: unknown) {
    console.error('[spotify] search failed', err);
    return NextResponse.json({ error: 'Spotify search failed. Try again in a moment.', code: 'spotify_search_failed' }, { status: 500 });
  }
}
