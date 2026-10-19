'use client';
import { useState } from 'react';
import type { DownloadItem } from '../types';

interface AccountStatus {
  google:  { channelName: string } | null;
  tiktok:  { channelName: string } | null;
}

interface Props {
  item: DownloadItem;
  accounts: AccountStatus | null;
}

type Platform = 'youtube' | 'tiktok';

interface FormState {
  title: string;
  description: string;
  tags: string;
  privacy: string;
  publishAt: string;
  caption: string;
  tiktokPrivacy: string;
}

export default function PublishClip({ item, accounts }: Props) {
  const [open, setOpen]           = useState(false);
  const [platform, setPlatform]   = useState<Platform>('youtube');
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<{ url?: string; error?: string } | null>(null);
  const [form, setForm]           = useState<FormState>({
    title:         item.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
    description:   '#Shorts #Music',
    tags:          'shorts,music',
    privacy:       'public',
    publishAt:     '',
    caption:       '#Shorts #Music',
    tiktokPrivacy: 'PUBLIC_TO_EVERYONE',
  });

  const setF = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-surface2)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition';

  const publish = async () => {
    setUploading(true); setResult(null);
    try {
      const res  = await fetch(item.url);
      const blob = await res.blob();
      const fd   = new FormData();
      fd.append('video', new File([blob], item.filename, { type: blob.type }));

      if (platform === 'youtube') {
        fd.append('title',       form.title);
        fd.append('description', form.description);
        fd.append('tags',        form.tags);
        fd.append('privacy',     form.privacy);
        if (form.publishAt) fd.append('publishAt', new Date(form.publishAt).toISOString());
        const r = await fetch('/api/upload/youtube', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setResult({ url: d.shortsUrl });
      } else {
        fd.append('caption', form.caption);
        fd.append('privacy', form.tiktokPrivacy);
        const r = await fetch('/api/upload/tiktok', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setResult({ url: 'https://www.tiktok.com/creator-center' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload error';
      setResult({ error: msg });
    } finally {
      setUploading(false);
    }
  };

  const canPublishYT = !!accounts?.google;
  const canPublishTT = !!accounts?.tiktok;
  if (!canPublishYT && !canPublishTT) return null;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setPlatform(canPublishYT ? 'youtube' : 'tiktok'); setResult(null); }}
        className="shrink-0 px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
      >
        Publish
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[var(--text-1)]">Publish Clip</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-[var(--text-2)] truncate">{item.filename}</p>

            {/* Platform tabs */}
            <div className="flex gap-2">
              {canPublishYT && (
                <button onClick={() => setPlatform('youtube')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition cursor-pointer ${platform === 'youtube' ? 'bg-red-600 text-white border-red-600' : 'bg-[var(--bg-surface2)] text-[var(--text-2)] border-[var(--border)]'}`}>
                  YouTube
                </button>
              )}
              {canPublishTT && (
                <button onClick={() => setPlatform('tiktok')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition cursor-pointer ${platform === 'tiktok' ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-[var(--bg-surface2)] text-[var(--text-2)] border-[var(--border)]'}`}>
                  TikTok
                </button>
              )}
            </div>

            {platform === 'youtube' && (
              <div className="space-y-3">
                <div><label className="block text-xs text-[var(--text-2)] mb-1">Title</label><input className={inputCls} value={form.title} onChange={e => setF('title', e.target.value)} maxLength={100} /></div>
                <div><label className="block text-xs text-[var(--text-2)] mb-1">Description</label><textarea className={inputCls + ' resize-none h-20'} value={form.description} onChange={e => setF('description', e.target.value)} /></div>
                <div><label className="block text-xs text-[var(--text-2)] mb-1">Tags (comma-separated)</label><input className={inputCls} value={form.tags} onChange={e => setF('tags', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-2)] mb-1">Privacy</label>
                    <select className={inputCls} value={form.privacy} onChange={e => setF('privacy', e.target.value)}>
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-2)] mb-1">Schedule (optional)</label>
                    <input type="datetime-local" className={inputCls} value={form.publishAt} onChange={e => setF('publishAt', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {platform === 'tiktok' && (
              <div className="space-y-3">
                <div><label className="block text-xs text-[var(--text-2)] mb-1">Caption</label><textarea className={inputCls + ' resize-none h-24'} value={form.caption} onChange={e => setF('caption', e.target.value)} maxLength={2200} /></div>
                <div>
                  <label className="block text-xs text-[var(--text-2)] mb-1">Privacy</label>
                  <select className={inputCls} value={form.tiktokPrivacy} onChange={e => setF('tiktokPrivacy', e.target.value)}>
                    <option value="PUBLIC_TO_EVERYONE">Public</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                    <option value="SELF_ONLY">Only me</option>
                  </select>
                </div>
              </div>
            )}

            {result && (
              <div className={`rounded-xl px-4 py-3 text-sm ${result.error ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                {result.error ? `Error: ${result.error}` : (
                  <>✓ Published! <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">View →</a></>
                )}
              </div>
            )}

            <button
              onClick={publish}
              disabled={uploading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition cursor-pointer disabled:opacity-40"
            >
              {uploading ? '⟳ Uploading…' : `Publish to ${platform === 'youtube' ? 'YouTube Shorts' : 'TikTok'}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
