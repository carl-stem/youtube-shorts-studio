'use client';

import type { Segment, DownloadItem } from '../types';

interface Props {
  segments: Segment[];
  isManual: boolean;
  hasAudio: boolean;
  isRendering: boolean;
  isPreviewPlaying: boolean;
  progress: { pct: number; status: string };
  downloads: DownloadItem[];
  onPreviewSegment: (seg: Segment) => void;
  onRenderSegment: (seg: Segment) => void;
  onRenderAll: () => void;
  onStop: () => void;
  onTogglePreview: () => void;
  onSegmentChange: (idx: number, key: 'start' | 'duration', val: number) => void;
  onAddSegment: () => void;
  onDeleteSegment: (idx: number) => void;
  onAutoGenerate: () => void;
}

const inputCls =
  'w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-1)] mono text-sm focus:outline-none focus:border-indigo-500 transition min-h-[44px]';

export default function SegmentEditor({
  segments, isManual, hasAudio, isRendering, isPreviewPlaying,
  progress, downloads,
  onPreviewSegment, onRenderSegment, onRenderAll, onStop, onTogglePreview,
  onSegmentChange, onAddSegment, onDeleteSegment, onAutoGenerate,
}: Props) {
  const summaryNote = segments.length === 0
    ? 'Load an audio file to see slices'
    : `${segments.length} Short(s) · ${isManual ? 'manual' : 'auto'}`;

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">4</span>
          Shorts Segments &amp; Export
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--text-2)]">{summaryNote}</span>
          {(hasAudio || isManual) && (
            <button
              onClick={onAddSegment}
              className="text-xs px-2.5 py-1 rounded-lg bg-indigo-900/50 hover:bg-indigo-800/70 text-indigo-300 border border-indigo-700/50 transition cursor-pointer"
            >
              + Add
            </button>
          )}
          {isManual && (
            <button
              onClick={onAutoGenerate}
              className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-2)] border border-[var(--border)] transition cursor-pointer"
            >
              ↺ Auto
            </button>
          )}
        </div>
      </div>

      {/* Segment cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
        {segments.length === 0 ? (
          <div className="col-span-full text-xs text-[var(--text-3)] bg-[var(--bg-surface2)] border border-[var(--border)] rounded-xl p-4 text-center">
            {isManual
              ? 'No segments. Click "+ Add" to create one.'
              : 'No audio loaded yet. You can still test the live preview on the right!'}
          </div>
        ) : (
          segments.map((seg, idx) => (
            <div key={`${seg.index}-${idx}`} className="flex flex-col gap-2 bg-[var(--bg-surface2)] border border-[var(--border)] rounded-xl p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-indigo-300">
                  Part #{String(seg.index).padStart(2, '0')}
                </span>
                <button
                  onClick={() => onDeleteSegment(idx)}
                  title="Remove segment"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-3)] hover:text-rose-400 transition cursor-pointer rounded-lg hover:bg-rose-500/10"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[var(--text-3)] mb-0.5">Start (s)</label>
                  <input
                    type="number"
                    value={seg.start}
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    className={inputCls}
                    onChange={(e) => onSegmentChange(idx, 'start', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-3)] mb-0.5">Duration (s)</label>
                  <input
                    type="number"
                    value={seg.duration}
                    min={1}
                    max={60}
                    step={0.1}
                    inputMode="decimal"
                    className={inputCls}
                    onChange={(e) => onSegmentChange(idx, 'duration', Math.max(1, Math.min(60, parseFloat(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onPreviewSegment(seg)}
                  disabled={isRendering}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-1)] transition cursor-pointer disabled:opacity-40 text-sm"
                >
                  ▷ Preview
                </button>
                <button
                  onClick={() => onRenderSegment(seg)}
                  disabled={isRendering}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition cursor-pointer disabled:opacity-40 text-sm"
                >
                  ⬇ Export
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={onTogglePreview}
          disabled={isRendering}
          className="flex-1 py-3 px-4 rounded-xl bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-1)] font-semibold text-sm flex items-center justify-center gap-2 border border-[var(--border)] transition cursor-pointer disabled:opacity-40"
        >
          <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          {isPreviewPlaying ? 'Stop Preview' : 'Play Live Preview'}
        </button>

        {!isRendering ? (
          <button
            onClick={onRenderAll}
            disabled={segments.length === 0}
            className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Render &amp; Download All
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            Stop Render
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-[var(--text-2)]">
          <span>{progress.status}</span>
          <span className="mono">{progress.pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-[var(--bg-surface2)] rounded-full overflow-hidden border border-[var(--border)]">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-150"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>

      {/* Downloads */}
      {downloads.length > 0 && (
        <div className="pt-2 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completed Exports:</h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {downloads.map((d, i) => (
              <div key={i} className="flex items-center justify-between bg-[var(--bg-surface2)] border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs">
                <span className="text-[var(--text-1)] font-medium truncate mr-3">
                  {d.filename}{' '}
                  <span className="text-[var(--text-3)] mono">({(d.sizeBytes / 1024 / 1024).toFixed(2)} MB)</span>
                </span>
                <a
                  href={d.url}
                  download={d.filename}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shrink-0"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
