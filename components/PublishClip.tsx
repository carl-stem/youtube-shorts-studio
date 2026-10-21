'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AccountStatus, DownloadItem } from '../types';
import type { ResumeRecord } from '../lib/publish/resumable';
import {
  UploadError, findResumableUpload, forgetResumableUpload, resumeYouTubeUpload, uploadToYouTube, type UploadProgress,
} from '../lib/publish/youtubeUpload';
import { initialYouTubeForm, isShortsCandidate, toYouTubeDraft, youTubeFormProblem, type YouTubeForm } from '../lib/publish/youtubeDraft';
import { prepareThumbnail } from '../lib/publish/thumbnail';
import { uploadToTikTok } from '../lib/publish/tiktokUpload';
import { DEFAULT_CATEGORY_ID } from '../lib/youtubeMetadata';
import UploadProgressBar from './publish/UploadProgressBar';
import YouTubeFields from './publish/YouTubeFields';
import TikTokFields, { type TikTokCreatorInfo } from './publish/TikTokFields';
import PublishResult, { type PublishResultState } from './publish/PublishResult';

interface Props {
  item: DownloadItem;
  accounts: AccountStatus | null;
  /** '10' (Music) from the audio workflow; People & Blogs otherwise. */
  defaultCategoryId?: string;
}

type Platform = 'youtube' | 'tiktok';
type PublishState = 'ready' | 'transferring' | 'processing' | 'processed' | 'awaiting-user' | 'published' | 'failed';

export default function PublishClip({ item, accounts, defaultCategoryId = DEFAULT_CATEGORY_ID }: Props) {
  const [open, setOpen]           = useState(false);
  const [platform, setPlatform]   = useState<Platform>('youtube');
  const [publishState, setPublishState] = useState<PublishState>('ready');
  const [result, setResult] = useState<PublishResultState | null>(null);
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState('');
  const [tiktokPublishId, setTiktokPublishId] = useState('');
  const [tiktokStatusLoading, setTiktokStatusLoading] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [youtubeStatusLoading, setYoutubeStatusLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null);
  const [ytForm, setYtForm] = useState<YouTubeForm>(() => initialYouTubeForm(item, defaultCategoryId));
  const [thumbnail, setThumbnail] = useState<{ name: string; previewUrl: string; blob: Blob } | null>(null);
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [thumbnailError, setThumbnailError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const itemDurationSeconds = Number(item.durationSeconds ?? 0);
  const shortsCandidate = isShortsCandidate(item);

  // A saved unfinished upload for this export (same name and size) can be resumed after a reload.
  useEffect(() => {
    if (open) setResumeRecord(findResumableUpload({ name: item.filename, size: item.sizeBytes }));
  }, [open, item.filename, item.sizeBytes]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => { if (thumbnail) URL.revokeObjectURL(thumbnail.previewUrl); }, [thumbnail]);

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

  const pickThumbnail = async (file: File | null) => {
    setThumbnailError('');
    if (!file) { setThumbnail(null); return; }
    setThumbnailBusy(true);
    try {
      const blob = await prepareThumbnail(file);
      setThumbnail({ name: file.name, previewUrl: URL.createObjectURL(blob), blob });
    } catch (error) {
      setThumbnail(null); setThumbnailError(error instanceof Error ? error.message : 'This image could not be used.');
    } finally { setThumbnailBusy(false); }
  };

  const sendThumbnail = async (videoId: string, blob: Blob): Promise<PublishResultState['thumbnailNote']> => {
    try {
      const response = await fetch(`/api/upload/youtube/thumbnail?videoId=${encodeURIComponent(videoId)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (response.ok) return { ok: true, text: 'Thumbnail set.' };
      const data = await response.json().catch(() => ({})) as { error?: string };
      return { ok: false, text: `Video uploaded, but the thumbnail was not set: ${data.error || 'YouTube refused it.'}` };
    } catch { return { ok: false, text: 'Video uploaded, but the thumbnail could not be sent. You can add it in YouTube Studio.' }; }
  };

  const readExport = async (): Promise<File> => {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error('Could not read the local export. Download it again before uploading.');
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('The selected export is empty. Export the clip again before uploading.');
    return new File([blob], item.filename, { type: blob.type });
  };

  const publishYouTube = async (resume: ResumeRecord | null) => {
    const file = await readExport();
    const controller = new AbortController();
    abortRef.current = controller;
    const options = { signal: controller.signal, onProgress: setUploadProgress };
    const d = resume ? await resumeYouTubeUpload(file, resume, options) : await uploadToYouTube(file, toYouTubeDraft(ytForm), options);
    setResumeRecord(null);
    setYoutubeVideoId(d.tracked ? d.videoId : '');
    setPublishState('processing');
    const thumbnailNote = thumbnail && !resume
      ? (d.tracked ? await sendThumbnail(d.videoId, thumbnail.blob) : { ok: false, text: 'Add the thumbnail in YouTube Studio; it could not be sent automatically.' })
      : undefined;
    setResult({
      url: d.shortsUrl,
      thumbnailNote,
      message: d.tracked
        ? 'YouTube accepted the upload and is processing it. This can take a few minutes; publication is not confirmed yet.'
        : 'YouTube accepted the upload, but status checks are unavailable. Check YouTube Studio for processing.',
    });
  };

  const publishTikTok = async () => {
    if (!creatorInfo || creatorLoading || (itemDurationSeconds > 0 && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds)) {
      throw new Error(creatorError || 'TikTok account upload limits are not available. Refresh creator settings and try again.');
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const d = await uploadToTikTok(await readExport(), { signal: controller.signal, onProgress: setUploadProgress });
    setTiktokPublishId(d.publishId);
    setPublishState('awaiting-user');
    setResult({ message: 'Upload sent to TikTok. Open the TikTok app to review and finish posting it — it is not published yet.' });
  };

  const publish = async (resume: ResumeRecord | null = null) => {
    setPublishState('transferring'); setResult(null);
    try {
      if (platform === 'youtube') await publishYouTube(resume);
      else await publishTikTok();
    } catch (e: unknown) {
      const paused = e instanceof UploadError && e.code === 'cancelled';
      setPublishState(paused ? 'ready' : 'failed');
      setResumeRecord(findResumableUpload({ name: item.filename, size: item.sizeBytes }));
      setResult(paused ? { message: e.message } : { error: e instanceof Error ? e.message : 'Upload error' });
    } finally {
      abortRef.current = null;
      setUploadProgress(null);
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
        setPublishState('processed'); setResult((prev) => ({ url: data.shortsUrl, thumbnailNote: prev?.thumbnailNote, message: `YouTube finished processing. Current visibility: ${data.privacyStatus || 'unknown'}. Processing alone does not confirm the video is live.` }));
      } else if (data.status === 'failed') {
        setPublishState('failed'); setResult({ error: `YouTube processing failed: ${data.failureReason || data.providerStatus}` });
      } else setResult((prev) => ({ url: data.shortsUrl, thumbnailNote: prev?.thumbnailNote, message: `YouTube is still processing (${data.providerStatus}). Check again in a minute.` }));
    } catch (error) { setResult({ error: error instanceof Error ? error.message : 'Could not check YouTube status.' }); }
    finally { setYoutubeStatusLoading(false); }
  };

  const canPublishYT = !!accounts?.google;
  const canPublishTT = !!accounts?.tiktok;
  if (!canPublishYT && !canPublishTT) return null;

  const busyOrDone = publishState === 'transferring' || publishState === 'processing' || publishState === 'processed' || publishState === 'awaiting-user' || publishState === 'published';
  const formProblem = platform === 'youtube'
    ? (thumbnailBusy ? 'Wait for the thumbnail to finish preparing.' : youTubeFormProblem(ytForm, Date.now()))
    : (!creatorInfo || creatorLoading || (itemDurationSeconds > 0 && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds) ? (creatorError || 'Checking your TikTok account…') : null);
  const statusCheck = youtubeVideoId
    ? { label: 'Check YouTube status', busyLabel: 'Checking YouTube…', busy: youtubeStatusLoading, onCheck: () => void checkYouTubeStatus() }
    : tiktokPublishId ? { label: 'Check TikTok status', busyLabel: 'Checking TikTok…', busy: tiktokStatusLoading, onCheck: () => void checkTikTokStatus() } : null;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setPlatform(canPublishYT ? 'youtube' : 'tiktok'); setResult(null); setPublishState('ready'); if (!canPublishYT) { setCreatorInfo(null); setCreatorError(''); } }}
        className="shrink-0 px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
      >
        Publish
      </button>

      {/* Portal: the step containers keep a transform from their entrance animation, which would trap a fixed overlay. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget && publishState !== 'transferring') setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 id="publish-title" className="font-bold text-[var(--text-1)]">Publish this video</h3>
              <button onClick={() => { abortRef.current?.abort(); setOpen(false); }} aria-label="Close" className="text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-[var(--text-2)] truncate">{item.filename}</p>

            <div className="flex gap-2">
              {canPublishYT && (
                <button disabled={publishState === 'transferring'} onClick={() => setPlatform('youtube')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition cursor-pointer disabled:opacity-50 ${platform === 'youtube' ? 'bg-red-600 text-white border-red-600' : 'bg-[var(--bg-surface2)] text-[var(--text-2)] border-[var(--border)]'}`}>
                  YouTube
                </button>
              )}
              {canPublishTT && (
                <button disabled={publishState === 'transferring'} onClick={() => { setPlatform('tiktok'); setCreatorInfo(null); setCreatorError(''); setPublishState('ready'); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition cursor-pointer disabled:opacity-50 ${platform === 'tiktok' ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-[var(--bg-surface2)] text-[var(--text-2)] border-[var(--border)]'}`}>
                  TikTok
                </button>
              )}
            </div>

            {platform === 'youtube' && (
              <YouTubeFields
                form={ytForm}
                onChange={(patch) => setYtForm((prev) => ({ ...prev, ...patch }))}
                shortsCandidate={shortsCandidate}
                thumbnail={thumbnail}
                thumbnailBusy={thumbnailBusy}
                thumbnailError={thumbnailError}
                onThumbnailPick={(file) => void pickThumbnail(file)}
                disabled={busyOrDone}
              />
            )}

            {platform === 'tiktok' && (
              <TikTokFields creatorInfo={creatorInfo} creatorLoading={creatorLoading} creatorError={creatorError} itemDurationSeconds={itemDurationSeconds} />
            )}

            {platform === 'youtube' && resumeRecord && publishState !== 'transferring' && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200 space-y-2">
                <p>An unfinished upload of this export was found. Resuming keeps the title and settings you chose when it started (a new thumbnail is not sent).</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void publish(resumeRecord)} className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500">Resume upload</button>
                  <button type="button" onClick={() => { forgetResumableUpload(resumeRecord.uploadId); setResumeRecord(null); }} className="rounded-lg border border-sky-400/40 px-3 py-1.5 font-semibold">Start over</button>
                </div>
              </div>
            )}

            {uploadProgress && publishState === 'transferring' && <UploadProgressBar progress={uploadProgress} destination={platform === 'youtube' ? 'YouTube' : 'TikTok'} canResume={platform === 'youtube'} onCancel={() => abortRef.current?.abort()} />}

            {result && <PublishResult result={result} statusCheck={statusCheck} />}

            <p className="text-[11px] text-[var(--text-3)]">By continuing, you authorize uploading this selected local export with the settings shown above. The original export remains available on this device.</p>
            {!busyOrDone && formProblem && <p className="text-xs text-amber-300">{formProblem}</p>}
            <button
              onClick={() => { if (window.confirm(`Upload ${item.filename} to ${platform === 'youtube' ? 'YouTube' : 'TikTok'} with the selected settings?`)) void publish(); }}
              disabled={busyOrDone || !!formProblem}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition cursor-pointer disabled:opacity-40"
            >
              {publishState === 'transferring' ? '⟳ Uploading…' : publishState === 'processing' ? 'Processing — check status above' : publishState === 'processed' ? 'Processing complete — check status above' : publishState === 'awaiting-user' ? 'Finish in TikTok' : publishState === 'published' ? 'Published' : `Upload to ${platform === 'youtube' ? 'YouTube' : 'TikTok'}`}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
