'use client';

import { renameProject } from '../../lib/editor/ops';
import { PROJECT_FILE_EXTENSION, serializeProject } from '../../lib/editor/schema';
import { useEditor } from './EditorProvider';

const smallButton = 'rounded-lg border border-[var(--border)] bg-[var(--bg-surface2)] px-3 py-1.5 text-xs font-semibold hover:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40';
const SAVE_LABELS = { saved: 'Saved on this device', saving: 'Saving…', error: 'Could not save — check browser storage' } as const;

/** Project name, save status, backup, undo/redo and leaving the project. */
export default function ProjectBar({ locked, onClose }: { locked: boolean; onClose: () => void }) {
  const { project, format, history, apply, seal, undo, redo, saveState } = useEditor();
  const hasFiles = Object.keys(project.media).length > 0;

  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(project.name || 'project').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60)}${PROJECT_FILE_EXTENSION}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          className="min-w-0 max-w-xs flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-[var(--border)] focus:border-indigo-500 focus:outline-none"
          value={project.name}
          maxLength={100}
          aria-label="Project name"
          onChange={(event) => apply((p) => renameProject(p, event.target.value), 'Rename project', 'rename')}
          onBlur={(event) => { if (!event.target.value.trim()) apply((p) => renameProject(p, 'Untitled project'), 'Rename project', 'rename'); seal(); }}
        />
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500 sm:inline">{format.label}</span>
        <span className={`text-[11px] ${saveState === 'error' ? 'text-rose-500' : 'text-[var(--text-3)]'}`} role="status">{hasFiles ? SAVE_LABELS[saveState] : 'Saves once you add a video'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} onClick={undo} disabled={locked || !history.past.length} title={history.past.length ? `Undo: ${history.past[history.past.length - 1].label}` : 'Nothing to undo'}>↶ Undo</button>
        <button type="button" className={smallButton} onClick={redo} disabled={locked || !history.future.length} title={history.future.length ? `Redo: ${history.future[0].label}` : 'Nothing to redo'}>↷ Redo</button>
        <button type="button" className={smallButton} onClick={downloadBackup} disabled={!hasFiles} title="Download the project settings (not the videos) as a file">Save a backup</button>
        <button type="button" className={smallButton} onClick={onClose} disabled={locked}>My projects</button>
      </div>
    </div>
  );
}
