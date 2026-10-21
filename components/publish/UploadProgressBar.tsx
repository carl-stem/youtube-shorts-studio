'use client';
import type { UploadProgress } from '../../lib/publish/youtubeUpload';

interface Props {
  progress: UploadProgress;
  onCancel: () => void;
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export default function UploadProgressBar({ progress, onCancel }: Props) {
  const pct = progress.totalBytes > 0 ? Math.floor((progress.sentBytes / progress.totalBytes) * 100) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
      <div className="flex justify-between text-xs text-[var(--text-2)]">
        <span>
          {progress.retryInSeconds
            ? `Connection problem. Trying again in ${progress.retryInSeconds}s…`
            : `Uploading ${mb(progress.sentBytes)} of ${mb(progress.totalBytes)} MB`}
        </span>
        <span className="mono">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--bg-surface2)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Upload progress"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        {/* Shown so the owner can tell which path a real upload used. */}
        <span className="text-[11px] text-[var(--text-3)]" data-upload-mode={progress.mode}>
          {progress.mode === 'direct' ? 'Sending straight to YouTube' : 'Sending through Shorts Studio'}
        </span>
        <button type="button" onClick={onCancel} className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10">
          Pause upload
        </button>
      </div>
      <p className="text-[11px] text-[var(--text-3)]">Keep this tab open. If the upload stops, publish the same export again to continue where it left off.</p>
    </div>
  );
}
