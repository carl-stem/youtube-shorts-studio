'use client';
import { useState, useCallback } from 'react';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artUrl: string | null;
  artMedium: string | null;
  spotifyUrl: string;
  durationMs: number;
}

interface Props {
  onSelect: (title: string, artist: string, artUrl: string | null) => void;
}

export default function SpotifySearch({ onSelect }: Props) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SpotifyTrack[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults([]);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.tracks);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const pick = (t: SpotifyTrack) => {
    setSelected(t.id);
    onSelect(t.title, t.artist, t.artMedium ?? t.artUrl);
  };

  const durationStr = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center text-base">🎵</span>
        <span>Find on Spotify</span>
        <span className="text-[10px] font-normal text-[var(--text-3)] ml-auto">Auto-fill track info</span>
      </h2>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search artist, track, or paste Spotify URL…"
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface2)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition placeholder:text-[var(--text-3)]"
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition cursor-pointer disabled:opacity-40 shrink-0"
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error.includes('not configured')
            ? '⚙️ Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to Vercel env vars to enable this feature.'
            : `Error: ${error}`}
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {results.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className={`relative flex flex-col text-left rounded-xl overflow-hidden border transition cursor-pointer
                ${selected === t.id
                  ? 'border-green-500 ring-2 ring-green-500/30'
                  : 'border-[var(--border)] hover:border-indigo-500/50'
                }
              `}
            >
              {t.artUrl
                ? <img src={t.artUrl} alt={t.album} className="w-full aspect-square object-cover" />
                : <div className="w-full aspect-square bg-[var(--bg-surface2)] flex items-center justify-center text-3xl">🎵</div>
              }
              <div className="p-2 bg-[var(--bg-surface2)]">
                <p className="text-xs font-semibold text-[var(--text-1)] line-clamp-1">{t.title}</p>
                <p className="text-[10px] text-[var(--text-3)] line-clamp-1">{t.artist}</p>
                <p className="text-[10px] text-[var(--text-3)] mono mt-0.5">{durationStr(t.durationMs)}</p>
              </div>
              {selected === t.id && (
                <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
