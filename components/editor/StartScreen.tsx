'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../lib/editor/model';
import { deleteProject, listProjects, loadProject, type ProjectSummary } from '../../lib/editor/persist';
import { PROJECT_FILE_EXTENSION, parseProject } from '../../lib/editor/schema';
import { formatTimecode } from '../../lib/editor/timeline';
import { FORMATS, type AspectId } from '../../lib/render/layout';
import type { Notify } from './EditorProvider';

interface Choice {
  id: AspectId | 'visualizer';
  title: string;
  detail: string;
  shape: string;
  available: boolean;
}

const CHOICES: Choice[] = [
  { id: 'short', title: 'Short', detail: 'Vertical 9:16, up to 3 minutes', shape: 'h-14 w-8', available: true },
  { id: 'landscape', title: 'Video', detail: 'Widescreen 16:9, any length', shape: 'h-8 w-14', available: false },
  { id: 'square', title: 'Square', detail: '1:1 for feeds', shape: 'h-11 w-11', available: false },
  { id: 'visualizer', title: 'Music visualizer', detail: 'Turn a song into Shorts', shape: 'h-14 w-8', available: true },
];

interface Props {
  onPick: (format: AspectId) => void;
  onOpen: (project: Project) => void;
  onOpenVisualizer: () => void;
  notify: Notify;
}

export default function StartScreen({ onPick, onOpen, onOpenVisualizer, notify }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const open = async (id: string) => {
    try {
      const project = await loadProject(id);
      if (project) onOpen(project);
      else notify('That project could not be found.', 'error');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const remove = async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete "${summary.name}"? Its saved copies of your videos are removed too. Your original files are not touched.`)) return;
    await deleteProject(summary.id).catch(() => notify('Could not delete that project.', 'error'));
    setProjects((current) => current?.filter((entry) => entry.id !== summary.id) ?? null);
  };

  const importBackup = async (file: File) => {
    const result = parseProject(await file.text());
    if (!result.ok) { notify(result.error, 'error'); return; }
    onOpen(result.project);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {projects && projects.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold tracking-tight">Continue editing</h2>
          <ul className="mt-3 space-y-2">
            {projects.map((summary) => (
              <li key={summary.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(summary.id)}>
                  <span className="block truncate font-semibold">{summary.name}</span>
                  <span className="block text-xs text-[var(--text-2)]">
                    {FORMATS[summary.format].label} · {summary.clipCount} clip{summary.clipCount === 1 ? '' : 's'} · {formatTimecode(summary.durationSeconds)} · edited {new Date(summary.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500" onClick={() => void open(summary.id)}>Open</button>
                <button type="button" className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => void remove(summary)} aria-label={`Delete ${summary.name}`}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500">New project</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">What are you making?</h2>
      <p className="mt-1 text-sm text-[var(--text-2)]">Pick a shape. Your videos stay on this device, and your project saves as you go.</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={!choice.available}
            onClick={() => (choice.id === 'visualizer' ? onOpenVisualizer() : onPick(choice.id))}
            className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-left transition hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-900/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--border)] disabled:hover:shadow-none"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
              <span className={`${choice.shape} rounded-md border-2 border-indigo-400 bg-indigo-500/20`} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{choice.title}</span>
              <span className="block text-xs text-[var(--text-2)]">{choice.detail}</span>
              {!choice.available && <span className="mt-1 inline-block rounded-full bg-[var(--bg-surface2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">Coming soon</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-6 text-xs text-[var(--text-2)]">
        Have a backup file?{' '}
        <button type="button" className="font-semibold text-indigo-500 hover:underline" onClick={() => backupRef.current?.click()}>Open a {PROJECT_FILE_EXTENSION} file</button>
        <input ref={backupRef} type="file" accept={`${PROJECT_FILE_EXTENSION},application/json,.json`} className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importBackup(file); }} />
      </div>
    </div>
  );
}
