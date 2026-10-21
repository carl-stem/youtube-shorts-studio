'use client';
import { useEffect, useState } from 'react';
import type { DownloadItem } from '../types';
import { uploadToYouTube } from '../lib/publish/youtubeUpload';

interface AccountStatus {
  google:  { channelName: string } | null;
  tiktok:  { channelName: string } | null;
}

interface Props {
  item: DownloadItem;
  accounts: AccountStatus | null;
}

type Platform = 'youtube' | 'tiktok';
type PublishState = 'ready' | 'transferring' | 'processing' | 'processed' | 'awaiting-user' | 'published' | 'failed';

interface TikTokCreatorInfo {
  username?: string;
  nickname?: string;
  privacyOptions: string[];
  maxVideoDurationSeconds: number;
}

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
  const [publishState, setPublishState] = useState<PublishState>('ready');
  const [result, setResult] = useState<{ url?: string; message?: string; error?: string } | null>(null);
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState('');
  const [tiktokPublishId, setTiktokPublishId] = useState('');
  const [tiktokStatusLoading, setTiktokStatusLoading] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [youtubeStatusLoading, setYoutubeStatusLoading] = useState(false);
  const itemDurationSeconds = Number(item.durationSeconds ?? 0);
  const [form, setForm]           = useState<FormState>({
    title:         item.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
    description:   '#Shorts #Music',
    tags:          'shorts,music',
    privacy:       'private',
    publishAt:     '',
    caption:       '#Shorts #Music',
    tiktokPrivacy: '',
  });

  const setF = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  const refreshCreatorInfo = async () => {
    setCreatorLoading(true); setCreatorError('');
    try {
      const response = await fetch('/api/auth/tiktok/creator-info', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load TikTok creator options.');
      const info = data as TikTokCreatorInfo;
      setCreatorInfo(info);
      if (itemDurationSeconds > info.maxVideoDurationSeconds) {
        setCreatorError(`This export is ${itemDurationSeconds}s, longer than this account’s ${info.maxVideoDurationSeconds}s TikTok limit.`);
      }
    } catch (error) {
      setCreatorInfo(null); setCreatorError(error instanceof Error ? error.message : 'Could not load TikTok creator options.');
    } finally { setCreatorLoading(false); }
  };

  useEffect(() => {
    if (open && platform === 'tiktok' && !creatorInfo && !creatorLoading && !creatorError) void refreshCreatorInfo();
  }, [open, platform, creatorInfo, creatorLoading, creatorError]);

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-surface2)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition';

  const publish = async () => {
    setPublishState('transferring'); setResult(null);
    try {
      const res  = await fetch(item.url);
      if (!res.ok) throw new Error('Could not read the local export. Download it again before uploading.');
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('The selected export is empty. Export the clip again before uploading.');
      const file = new File([blob], item.filename, { type: blob.type });
      const fd   = new FormData();
      fd.append('video', file);

      if (platform === 'youtube') {
        const privacy = form.privacy === 'public' || form.privacy === 'unlisted' ? form.privacy : 'private';
        const d = await uploadToYouTube(file, {
          title: form.title,
          description: form.description,
          tags: form.tags,
          privacy,
          publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
          categoryId: '10',
          madeForKids: false,
        });
        setYoutubeVideoId(d.videoId);
        setPublishState('processing');
        setResult({ url: d.shortsUrl, message: 'YouTube accepted the upload. Processing may take a few minutes; publication is not confirmed yet.' });
      } else {
        if (!creatorInfo || creatorLoading || (itemDurationSeconds > 0 && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds)) {
          throw new Error(creatorError || 'TikTok account upload limits are not available. Refresh creator settings and try again.');
        }
        fd.append('caption', form.caption);
        fd.append('privacy', 'SELF_ONLY');
        const r = await fetch('/api/upload/tiktok', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setTiktokPublishId(d.publishId);
        setPublishState('awaiting-user');
        setResult({ message: d.message || 'TikTok accepted the upload. Publication is not confirmed yet.' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload error';
      setPublishState('failed');
      setResult({ error: msg });
    }
  };

  const checkTikTokStatus = async () => {
    if (!tiktokPublishId) return;
    setTiktokStatusLoading(true);
    try {
      const response = await fetch(`/api/upload/tiktok/status?publishId=${encodeURIComponent(tiktokPublishId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Status check failed.');
      if (data.status === 'published') {
        setPublishState('published');
        setResult({ message: 'TikTok confirms the post is published. Check the post in TikTok to verify its visibility.' });
      } else if (data.status === 'failed') {
        setPublishState('failed'); setResult({ error: data.failReason || 'TikTok could not publish the video.' });
      } else if (data.status === 'awaiting-user') {
        setPublishState('awaiting-user'); setResult({ message: 'TikTok confirms this upload is in the inbox. Open TikTok to review and finish publishing it.' });
      } else setResult({ message: 'TikTok is still processing your upload. Check again shortly.' });
    } catch (error) { setResult({ error: error instanceof Error ? error.message : 'Could not check TikTok status.' }); }
    finally { setTiktokStatusLoading(false); }
  };

  const checkYouTubeStatus = async () => {
    if (!youtubeVideoId) return;
    setYoutubeStatusLoading(true);
    try {
      const response = await fetch(`/api/upload/youtube/status?videoId=${encodeURIComponent(youtubeVideoId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Status check failed.');
      if (data.status === 'processed') {
        setPublishState('processed'); setResult({ url: data.shortsUrl, message: `YouTube processing succeeded. Current visibility: ${data.privacyStatus || 'unknown'}. Processing status alone does not confirm publication.` });
      } else if (data.status === 'failed') {
        setPublishState('failed'); setResult({ error: `YouTube processing failed: ${data.failureReason || data.providerStatus}` });
      } else setResult({ url: data.shortsUrl, message: `YouTube status: ${data.providerStatus}. Processing is not complete yet.` });
    } catch (error) { setResult({ error: error instanceof Error ? error.message : 'Could not check YouTube status.' }); }
    finally { setYoutubeStatusLoading(false); }
  };

  const canPublishYT = !!accounts?.google;
  const canPublishTT = !!accounts?.tiktok;
  if (!canPublishYT && !canPublishTT) return null;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setPlatform(canPublishYT ? 'youtube' : 'tiktok'); setResult(null); setPublishState('ready'); if (!canPublishYT) { setCreatorInfo(null); setCreatorError(''); } }}
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
                <button onClick={() => { setPlatform('tiktok'); setCreatorInfo(null); setCreatorError(''); setPublishState('ready'); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition cursor-pointer ${platform === 'tiktok' ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-[var(--bg-surface2)] text-[var(--text-2)] border-[var(--border)]'}`}>
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
                  <p className="rounded-lg bg-[var(--bg-surface2)] p-3 text-xs text-[var(--text-2)]">TikTok will deliver this video to your inbox. Open TikTok to choose privacy, review, and finish publishing.</p>
                  {creatorLoading && <p role="status" className="mt-2 text-xs text-[var(--text-2)]">Checking account upload limit…</p>}
                  {creatorError && <p role="alert" className="mt-2 text-xs text-rose-300">{creatorError}</p>}
                  {creatorInfo && <p className="mt-2 text-[11px] text-[var(--text-3)]">{creatorInfo.nickname || creatorInfo.username || 'Connected creator'} · Max duration {creatorInfo.maxVideoDurationSeconds}s.</p>}
                  {creatorInfo && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds && <p role="alert" className="mt-1 text-xs text-rose-300">This export is {itemDurationSeconds}s, longer than this account’s {creatorInfo.maxVideoDurationSeconds}s limit.</p>}
                </div>
              </div>
            )}

            {result && (
              <div role="status" className={`rounded-xl px-4 py-3 text-sm ${result.error ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-200 border border-amber-500/20'}`}>
                {result.error ? `Upload failed: ${result.error}. Your local export is unchanged.` : <>{result.message} {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">View on YouTube →</a>}</>}
                {youtubeVideoId && <button type="button" onClick={() => void checkYouTubeStatus()} disabled={youtubeStatusLoading} className="mt-3 block rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{youtubeStatusLoading ? 'Checking YouTube…' : 'Check YouTube status'}</button>}
                {tiktokPublishId && <button type="button" onClick={() => void checkTikTokStatus()} disabled={tiktokStatusLoading} className="mt-3 block rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{tiktokStatusLoading ? 'Checking TikTok…' : 'Check TikTok status'}</button>}
              </div>
            )}

            <p className="text-[11px] text-[var(--text-3)]">By continuing, you authorize uploading this selected local export with the settings shown above. The original export remains available on this device.</p>
            <button
              onClick={() => { if (window.confirm(`Upload ${item.filename} to ${platform === 'youtube' ? 'YouTube' : 'TikTok'} with the selected settings?`)) void publish(); }}
              disabled={publishState === 'transferring' || publishState === 'processing' || publishState === 'processed' || publishState === 'awaiting-user' || publishState === 'published' || (platform === 'tiktok' && (!creatorInfo || creatorLoading || (itemDurationSeconds > 0 && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds)))}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition cursor-pointer disabled:opacity-40"
            >
              {publishState === 'transferring' ? '⟳ Uploading…' : publishState === 'processing' ? 'Processing — check status above' : publishState === 'processed' ? 'Processing complete — check status above' : publishState === 'awaiting-user' ? 'Finish in TikTok' : publishState === 'published' ? 'Published' : `Upload to ${platform === 'youtube' ? 'YouTube Shorts' : 'TikTok'}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
