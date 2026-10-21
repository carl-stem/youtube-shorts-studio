'use client';

import { useState } from 'react';
import type { DragEvent } from 'react';
import type { Id } from '../../lib/editor/model';
import { moveClip, removeClip } from '../../lib/editor/ops';
import { clipLength, formatTimecode } from '../../lib/editor/timeline';
import { useEditor } from './EditorProvider';
import { thumbnailKey, useThumbnails } from './useThumbnails';

interface Props {
  selectedId: Id | null;
  onSelect: (clipId: Id) => void;
}

/** Big draggable clip tiles in story order. Arrow buttons do the same for touch and keyboard. */
export default function Storyboard({ selectedId, onSelect }: Props) {
  const { project, apply, mediaUrl } = useEditor();
  const thumbs = useThumbnails(project, mediaUrl);
  const [dragId, setDragId] = useState<Id | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragId) apply((p) => moveClip(p, dragId, index), 'Move clip');
    setDragId(null);
    setDropIndex(null);
  };

  if (!project.story.length) {
    return <div className="rounded-xl border-2 border-dashed border-[var(--border-input)] bg-[var(--bg-surface2)] p-6 text-center text-xs text-[var(--text-2)]">Your story is empty. Add a video in step 1, or use one of your videos again below.</div>;
  }

  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Clips in your story">
      {project.story.map((clip, index) => {
        const media = project.media[clip.mediaId];
        const selected = clip.id === selectedId;
        const thumb = thumbs[thumbnailKey(clip.mediaId, clip.in)];
        return (
          <li
            key={clip.id}
            draggable
            onDragStart={(event) => { setDragId(clip.id); event.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(event) => { event.preventDefault(); setDropIndex(index); }}
            onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
            onDrop={(event) => onDrop(event, index)}
            onDragEnd={() => { setDragId(null); setDropIndex(null); }}
            className={`group relative overflow-hidden rounded-xl border-2 bg-[var(--bg-surface2)] transition ${selected ? 'border-indigo-500 shadow-lg shadow-indigo-900/10' : 'border-transparent hover:border-indigo-500/40'} ${dropIndex === index && dragId !== clip.id ? 'ring-2 ring-fuchsia-500' : ''} ${dragId === clip.id ? 'opacity-50' : ''}`}
          >
            <button type="button" onClick={() => onSelect(clip.id)} className="block w-full text-left" aria-pressed={selected} aria-label={`Clip ${index + 1}: ${media?.name ?? 'video'}, ${formatTimecode(clipLength(clip))}`}>
              <span className="relative block aspect-video w-full bg-black">
                {thumb
                  ? <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                  : <span className="flex h-full items-center justify-center text-2xl text-[var(--text-3)]">🎞️</span>}
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{index + 1}</span>
                <span className="mono absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{formatTimecode(clipLength(clip))}</span>
                {clip.muted && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white" title="Sound off">🔇</span>}
              </span>
              <span className="block truncate px-2 pt-1.5 text-xs font-medium">{media?.name ?? 'Missing video'}</span>
            </button>
            <span className="flex items-center justify-between gap-1 px-1.5 pb-1.5 pt-1">
              <span className="flex gap-1">
                <button type="button" className="rounded-md px-2 py-1 text-xs text-[var(--text-2)] hover:bg-indigo-500/10 disabled:opacity-30" disabled={index === 0} onClick={() => apply((p) => moveClip(p, clip.id, index - 1), 'Move clip')} aria-label={`Move clip ${index + 1} earlier`}>◀</button>
                <button type="button" className="rounded-md px-2 py-1 text-xs text-[var(--text-2)] hover:bg-indigo-500/10 disabled:opacity-30" disabled={index === project.story.length - 1} onClick={() => apply((p) => moveClip(p, clip.id, index + 1), 'Move clip')} aria-label={`Move clip ${index + 1} later`}>▶</button>
              </span>
              <button type="button" className="rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => apply((p) => removeClip(p, clip.id), 'Delete clip')} aria-label={`Delete clip ${index + 1}`}>Delete</button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
