'use client';
import { useState, useEffect } from 'react';

interface AccountStatus {
  kvConfigured: boolean;
  authenticated: boolean;
  google:  { channelName: string; connected: boolean } | null;
  tiktok:  { channelName: string; connected: boolean } | null;
}

export default function ConnectAccounts() {
  const [status, setStatus]   = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res  = await fetch('/api/auth/status');
      const data = await res.json();
      setStatus(data);
    } catch { setStatus(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const [actionError, setActionError] = useState('');
  const disconnect = async (platform: 'google' | 'tiktok') => {
    setActionError('');
    try {
      const response = await fetch('/api/auth/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
      if (!response.ok) throw new Error('Disconnect failed. Please try again.');
      await refresh();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Disconnect failed.'); }
  };

  if (loading) return null;

  if (!status?.kvConfigured) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300 flex items-start gap-2">
        <span className="text-lg shrink-0">🔑</span>
        <div>
          <strong>Account connection is not available.</strong>{' '}
          Configure secure server-side token storage, then add <code className="bg-amber-500/20 px-1 rounded">KV_REST_API_URL</code>, <code className="bg-amber-500/20 px-1 rounded">GOOGLE_CLIENT_ID/SECRET</code>, and <code className="bg-amber-500/20 px-1 rounded">TIKTOK_CLIENT_KEY/SECRET</code> to Vercel env vars.{' '}
          See <strong>SETUP.md</strong> for instructions.
        </div>
      </div>
    );
  }

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
        <span className="text-base">🔗</span> Publishing Accounts
      </h3>
      {actionError && <p role="alert" className="text-xs text-rose-300">{actionError}</p>}
      {!status.authenticated && <p className="text-xs text-[var(--text-3)]">Connect a provider to create a private server-side session; its tokens are isolated from other browsers.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* YouTube */}
        <div className={`flex items-center justify-between p-3 rounded-xl border ${status.google ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--border)] bg-[var(--bg-surface2)]'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-1)]">
                {status.google ? status.google.channelName : 'YouTube'}
              </p>
              <p className={`text-[10px] ${status.google ? 'text-emerald-400' : 'text-[var(--text-3)]'}`}>
                {status.google ? '● Connected' : '○ Not connected'}
              </p>
            </div>
          </div>
          {status.google ? (
            <button onClick={() => disconnect('google')} className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer border border-rose-500/30 rounded px-2 py-1">
              Disconnect
            </button>
          ) : (
            <a href="/api/auth/google" className="text-[10px] font-semibold text-white bg-red-600 hover:bg-red-500 rounded px-2.5 py-1.5 transition">
              Connect
            </a>
          )}
        </div>

        {/* TikTok */}
        <div className={`flex items-center justify-between p-3 rounded-xl border ${status.tiktok ? 'border-zinc-500/40 bg-zinc-500/5' : 'border-[var(--border)] bg-[var(--bg-surface2)]'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-black border border-zinc-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-1)]">
                {status.tiktok ? status.tiktok.channelName : 'TikTok'}
              </p>
              <p className={`text-[10px] ${status.tiktok ? 'text-emerald-400' : 'text-[var(--text-3)]'}`}>
                {status.tiktok ? '● Connected' : '○ Not connected'}
              </p>
            </div>
          </div>
          {status.tiktok ? (
            <button onClick={() => disconnect('tiktok')} className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer border border-rose-500/30 rounded px-2 py-1">
              Disconnect
            </button>
          ) : (
            <a href="/api/auth/tiktok" className="text-[10px] font-semibold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded px-2.5 py-1.5 transition">
              Connect
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
