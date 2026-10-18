'use client';
import type { DownloadItem } from '../types';
import SocialShare from './SocialShare';

interface Props {
  segmentCount: number;
  isRendering: boolean;
  progress: { pct: number; status: string };
  downloads: DownloadItem[];
  onRenderAll: () => void;
  onStop: () => void;
}

export default function ExportPanel({ segmentCount, isRendering, progress, downloads, onRenderAll, onStop }: Props) {
  return (
    <div className="space-y-4">
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">🎬</span>
          Render &amp; Export — {segmentCount} Clip{segmentCount !== 1 ? 's' : ''}
        </h2>

        {!isRendering ? (
          <button
            onClick={onRenderAll}
            disabled={segmentCount === 0}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-base flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/30 transition cursor-pointer disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Render &amp; Download All {segmentCount} Short{segmentCount !== 1 ? 's' : ''}
          </button>
        ) : (
          <button onClick={onStop} className="w-full py-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base transition cursor-pointer">
            ⏹ Stop Render
          </button>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-[var(--text-2)]">
            <span>{progress.status}</span>
            <span className="mono">{progress.pct}%</span>
          </div>
          <div className="w-full h-3 bg-[var(--bg-surface2)] rounded-full overflow-hidden border border-[var(--border)]">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-150 rounded-full"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>

        {downloads.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completed Exports:</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {downloads.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-[var(--bg-surface2)] border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs">
                  <span className="text-[var(--text-1)] font-medium truncate mr-3">
                    {d.filename} <span className="text-[var(--text-3)] mono">({(d.sizeBytes / 1024 / 1024).toFixed(2)} MB)</span>
                  </span>
                  <a href={d.url} download={d.filename} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shrink-0">
                    ↓
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <SocialShare downloads={downloads} />
    </div>
  );
}
