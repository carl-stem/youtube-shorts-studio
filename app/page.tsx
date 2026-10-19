'use client';

import { useEffect, useState } from 'react';
import Studio from '../components/Studio';
import VideoStudio from '../components/VideoStudio';

type CreationMode = 'video' | 'audio';

export default function Home() {
  const [mode, setMode] = useState<CreationMode>('audio');
  const [requestedMode, setRequestedMode] = useState<CreationMode | null>(null);

  const workflowGuide = mode === 'video'
    ? 'Add videos → Choose a moment → Make it yours → Review & export'
    : 'Choose your audio → Style your Short → Edit clips → Preview & export';

  useEffect(() => {
    if (!requestedMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRequestedMode(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestedMode]);

  const requestMode = (nextMode: CreationMode) => {
    if (nextMode !== mode) setRequestedMode(nextMode);
  };

  const confirmModeChange = () => {
    if (!requestedMode) return;
    setMode(requestedMode);
    setRequestedMode(null);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-1)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Shorts Studio</h1>
            <p className="mt-1 text-xs text-[var(--text-3)]">{workflowGuide}</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--bg-surface2)] px-3 py-2 sm:justify-start" aria-label="Creation workflow">
            <span className={`text-xs font-semibold ${mode === 'audio' ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>Audio</span>
            <button
              type="button"
              role="switch"
              onClick={() => requestMode(mode === 'audio' ? 'video' : 'audio')}
              aria-checked={mode === 'video'}
              aria-label={`Switch to ${mode === 'audio' ? 'Video' : 'Audio'} Short workflow`}
              className={`relative h-7 w-14 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${mode === 'video' ? 'bg-indigo-600' : 'bg-slate-600'}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${mode === 'video' ? 'translate-x-8' : 'translate-x-1'}`} />
            </button>
            <span className={`text-xs font-semibold ${mode === 'video' ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>Video</span>
          </div>
        </div>
      </header>
      {mode === 'video' ? <VideoStudio /> : <Studio />}

      {requestedMode && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestedMode(null); }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="switch-workflow-title"
            aria-describedby="switch-workflow-description"
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl"
          >
            <h2 id="switch-workflow-title" className="text-lg font-bold">Switch to {requestedMode === 'audio' ? 'Audio' : 'Video'} Short?</h2>
            <p id="switch-workflow-description" className="mt-3 text-sm leading-relaxed text-[var(--text-2)]">
              Switching workflows will discard your current in-progress edits, imported media, and export list. Files you have already downloaded will remain on your device.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" autoFocus onClick={() => setRequestedMode(null)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] px-4 py-2.5 text-sm font-semibold hover:border-indigo-500/60">
                Stay here
              </button>
              <button type="button" onClick={confirmModeChange} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">
                Switch and discard
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
