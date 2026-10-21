'use client';

import { useRef } from 'react';
import { appendClip, removeMedia } from '../../../lib/editor/ops';
import { formatTimecode } from '../../../lib/editor/timeline';
import { MAX_MEDIA, defaultClipCap, useEditor } from '../EditorProvider';
import { StepCard, primaryButton } from './StepCard';

export default function AddMedia({ onNext }: { onNext: () => void }) {
  const { project, format, apply, addFiles, importing } = useEditor();
  const pickerRef = useRef<HTMLInputElement>(null);
  const media = Object.values(project.media);
  const clipCap = defaultClipCap(format);

  return (
    <StepCard step={1} eyebrow="Start with your footage" title="Add your videos" hint="Pick one or more videos. Each one becomes a clip in your story, in the order you add them.">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={() => pickerRef.current?.click()} disabled={importing}>{importing ? 'Reading videos…' : 'Choose videos'}</button>
        <input
          ref={pickerRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.m4v"
          multiple
          className="hidden"
          onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ''; void addFiles(picked); }}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--text-3)]">MP4 (H.264) works in every browser. Files stay on this device. Up to {MAX_MEDIA} videos.</p>

      {media.length ? (
        <ul className="mt-5 space-y-2">
          {media.map((item) => {
            const uses = project.story.filter((clip) => clip.mediaId === item.id).length;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400" aria-hidden="true">▶</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block text-xs text-[var(--text-3)]">{formatTimecode(item.duration)} · {item.width} × {item.height} · in your story {uses}×</span>
                </span>
                <button type="button" className="rounded-lg px-3 py-2 text-xs text-indigo-400 hover:bg-indigo-500/10" onClick={() => apply((p) => appendClip(p, item.id, clipCap), 'Use video again')}>Use again</button>
                <button type="button" className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => apply((p) => removeMedia(p, item.id), 'Remove video')}>Remove</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border-2 border-dashed border-[var(--border-input)] bg-[var(--bg-surface2)] p-8 text-center">
          <div className="text-3xl" aria-hidden="true">🎞️</div>
          <h3 className="mt-2 text-sm font-semibold">Start with videos you already have</h3>
          <p className="mt-1 text-xs text-[var(--text-2)]">Phone clips, screen recordings, anything your browser can play.</p>
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-indigo-500/10 pt-4">
        <button type="button" className={primaryButton} onClick={onNext} disabled={!project.story.length || importing}>
          {project.story.length ? 'Put it in order →' : 'Add a video to continue'}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{importing ? 'Reading videos' : ''}</span>
    </StepCard>
  );
}
