'use client';

import { useCallback, useEffect, useState } from 'react';
import Studio from '../components/Studio';
import VideoStudio from '../components/VideoStudio';
import Header from '../components/Header';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { authErrorMessage, readAuthRedirect } from '../lib/authErrors';
import type { AccountStatus, ProjectActions } from '../types';

type CreationMode = 'video' | 'audio';

export default function Home() {
  const [mode, setMode] = useState<CreationMode>('audio');
  const [requestedMode, setRequestedMode] = useState<CreationMode | null>(null);
  const [projectActions, setProjectActions] = useState<ProjectActions | null>(null);
  const [accounts, setAccounts] = useState<AccountStatus | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const { toasts, toast, dismiss } = useToast();

  // Fetched once here and shared with the header and both publish flows.
  const refreshAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status', { cache: 'no-store' });
      setAccounts(response.ok ? await response.json() as AccountStatus : null);
    } catch { setAccounts(null); }
    finally { setAccountsLoading(false); }
  }, []);
  useEffect(() => { void refreshAccounts(); }, [refreshAccounts]);

  // OAuth callbacks redirect to /?auth_error=<code> or /?connected=<provider>.
  useEffect(() => {
    const { errorCode, connected, cleanedSearch } = readAuthRedirect(window.location.search);
    if (!errorCode && !connected) return;
    const message = authErrorMessage(errorCode);
    if (message) toast(message, 'error', 8000);
    else if (connected) toast(`${connected === 'google' ? 'YouTube' : 'TikTok'} account connected.`, 'success');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${cleanedSearch}${window.location.hash}`);
  }, [toast]);

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
      <Header
        workflowGuide={workflowGuide}
        projectActions={mode === 'audio' ? projectActions : null}
        accounts={accounts}
        accountsLoading={accountsLoading}
        onAccountsChanged={() => void refreshAccounts()}
        modeSwitch={
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
              <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${mode === 'video' ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <span className={`text-xs font-semibold ${mode === 'video' ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>Video</span>
          </div>
        }
      />
      {mode === 'video'
        ? <VideoStudio accounts={accounts} />
        : <Studio accounts={accounts} onProjectActions={setProjectActions} />}

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
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
