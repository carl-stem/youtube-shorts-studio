'use client';
import { useState, useEffect } from 'react';

interface VideoStat {
  id: string; title: string; thumbnail: string;
  publishedAt: string; views: number; likes: number; comments: number;
  shortsUrl: string;
}
interface AnalyticsData {
  videos: VideoStat[];
  totals: { views: number; likes: number; comments: number; count: number };
}

interface Props { open: boolean; onClose: () => void; }

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-[var(--bg-surface2)] rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] mono text-[var(--text-3)] w-12 text-right">{value.toLocaleString()}</span>
    </div>
  );
}

export default function AnalyticsDashboard({ open, onClose }: Props) {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true); setError(null);
    fetch('/api/analytics/youtube')
      .then(r => r.json())
      .then((d: AnalyticsData & { error?: string }) => { if (d.error) throw new Error(d.error); setData(d); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxViews = data ? Math.max(...data.videos.map(v => v.views), 1) : 1;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md z-50 bg-[var(--bg-surface)] border-l border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-[var(--text-1)] flex items-center gap-2">
            <span>📊</span> YouTube Analytics
          </h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && <div className="text-center text-[var(--text-2)] py-12">Loading analytics…</div>}

          {error && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300">
              {error.includes('not connected')
                ? '🔗 Connect your YouTube account in Step 4 to see analytics.'
                : `Error: ${error}`}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Totals */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Views',    value: data.totals.views, icon: '👁' },
                  { label: 'Total Likes',    value: data.totals.likes, icon: '❤️' },
                  { label: 'Shorts Created', value: data.totals.count, icon: '🎬' },
                ].map(s => (
                  <div key={s.label} className="bg-[var(--bg-surface2)] border border-[var(--border)] rounded-xl p-3 text-center">
                    <div className="text-xl">{s.icon}</div>
                    <div className="text-lg font-bold text-[var(--text-1)] mt-1">{s.value.toLocaleString()}</div>
                    <div className="text-[10px] text-[var(--text-3)]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Video list */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2)]">Recent Shorts</h3>
              {data.videos.length === 0 && (
                <p className="text-sm text-[var(--text-3)] text-center py-6">No Shorts found on this channel yet.</p>
              )}
              <div className="space-y-3">
                {data.videos.map(v => (
                  <a key={v.id} href={v.shortsUrl} target="_blank" rel="noopener noreferrer"
                     className="flex gap-3 bg-[var(--bg-surface2)] border border-[var(--border)] rounded-xl p-3 hover:border-indigo-500/50 transition group">
                    {v.thumbnail && <img src={v.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-xs font-semibold text-[var(--text-1)] line-clamp-1 group-hover:text-indigo-400 transition">{v.title}</p>
                      <Bar value={v.views} max={maxViews} />
                      <div className="flex gap-3 text-[10px] text-[var(--text-3)]">
                        <span>👁 {v.views.toLocaleString()}</span>
                        <span>❤️ {v.likes.toLocaleString()}</span>
                        <span>💬 {v.comments.toLocaleString()}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
