'use client';

import { useRef, useState } from 'react';
import type { Id } from '../../lib/editor/model';
import { formatTimecode } from '../../lib/editor/timeline';
import { useEditor } from './EditorProvider';

/** Lists files this browser no longer has and lets people point to them again. */
export default function RelinkBanner() {
  const { missing, relink } = useEditor();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);
  if (!missing.length) return null;

  const choose = (mediaId: Id) => { setTarget(mediaId); pickerRef.current?.click(); };

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4" role="alert">
      <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Find {missing.length === 1 ? 'a file' : `${missing.length} files`} to keep editing</h2>
      <p className="mt-1 text-xs text-[var(--text-2)]">This project uses files that are not on this browser anymore. Choose each one again; it must be the same file (we check its length).</p>
      <ul className="mt-3 space-y-2">
        {missing.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{item.name} <span className="text-xs text-[var(--text-3)]">· {item.kind === 'video' ? 'video' : 'music'} · {formatTimecode(item.duration)}</span></span>
            <button type="button" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40" disabled={busy} onClick={() => choose(item.id)}>Find file</button>
          </li>
        ))}
      </ul>
      <input
        ref={pickerRef}
        type="file"
        accept={missing.find((item) => item.id === target)?.kind === 'audio' ? 'audio/*' : 'video/*,.mov,.m4v'}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || !target) return;
          setBusy(true);
          await relink(target, file);
          setBusy(false);
        }}
      />
    </div>
  );
}
