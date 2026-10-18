'use client';

import type { TrackMeta } from '../types';

interface Props {
  trackMeta: TrackMeta;
  onChange: (meta: TrackMeta) => void;
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-[#0e1017] border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 transition';

export default function TrackSettings({ trackMeta, onChange }: Props) {
  const set = (key: keyof TrackMeta, value: string | number | null) =>
    onChange({ ...trackMeta, [key]: value });

  return (
    <section className="bg-[#161822] border border-slate-800/80 rounded-2xl p-5 shadow-xl">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">2</span>
        Track Overlay & Slicing Options
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Track Title (On-Screen)</label>
          <input
            className={inputCls}
            value={trackMeta.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Born to Burn"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Artist Name</label>
          <input
            className={inputCls}
            value={trackMeta.artist}
            onChange={(e) => set('artist', e.target.value)}
            placeholder="e.g. The Forboden"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Clip Length (Seconds per Short)</label>
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={trackMeta.clipDuration}
            min={5} max={60}
            onChange={(e) => set('clipDuration', parseFloat(e.target.value) || 58)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Max Shorts Limit (Optional)</label>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={trackMeta.maxShorts ?? ''}
            placeholder="All parts"
            min={1} max={99}
            onChange={(e) => set('maxShorts', e.target.value ? parseInt(e.target.value, 10) : null)}
          />
        </div>
      </div>
    </section>
  );
}
