'use client';
import type { DownloadItem } from '../types';

interface Props { downloads: DownloadItem[]; }

export default function SocialShare({ downloads }: Props) {
  if (downloads.length === 0) return null;

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const shareLatest = async () => {
    const last = downloads[downloads.length - 1];
    try {
      const res = await fetch(last.url);
      const blob = await res.blob();
      const file = new File([blob], last.filename, { type: blob.type });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My YouTube Short', text: 'Check out my Short!' } as ShareData);
      } else {
        await navigator.share({ title: 'My YouTube Short', text: 'Check out my Short!', url: window.location.href });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error(err);
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
        <span>📤</span> Share Your Clips
      </h3>
      <p className="text-xs text-[var(--text-2)]">
        {downloads.length} clip{downloads.length !== 1 ? 's' : ''} ready — share directly or upload to your channel.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {canShare && (
          <button
            onClick={shareLatest}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition cursor-pointer"
          >
            <span>📱</span> Share via Device
          </button>
        )}
        <a
          href="https://studio.youtube.com/channel/upload"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Upload to YouTube
        </a>
        <a
          href="https://www.tiktok.com/creator-center/upload"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-black hover:bg-zinc-800 text-white font-semibold text-sm border border-zinc-700 transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/>
          </svg>
          Upload to TikTok
        </a>
      </div>
      <p className="text-[10px] text-[var(--text-3)] leading-relaxed">
        💡 <strong>YouTube Shorts:</strong> Videos under 60s in 9:16 format are automatically promoted as Shorts.{' '}
        <strong>TikTok:</strong> Upload the .mp4 file directly in TikTok Creator Center.
      </p>
    </div>
  );
}
