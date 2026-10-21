'use client';

export interface TikTokCreatorInfo {
  username?: string;
  nickname?: string;
  privacyOptions: string[];
  maxVideoDurationSeconds: number;
}

interface Props {
  caption: string;
  onCaptionChange: (caption: string) => void;
  creatorInfo: TikTokCreatorInfo | null;
  creatorLoading: boolean;
  creatorError: string;
  itemDurationSeconds: number;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-surface2)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition';

export default function TikTokFields({ caption, onCaptionChange, creatorInfo, creatorLoading, creatorError, itemDurationSeconds }: Props) {
  return (
    <div className="space-y-3">
      <div><label className="block text-xs text-[var(--text-2)] mb-1" htmlFor="tt-caption">Caption</label><textarea id="tt-caption" className={inputCls + ' resize-none h-24'} value={caption} onChange={e => onCaptionChange(e.target.value)} maxLength={2200} /></div>
      <div>
        <p className="rounded-lg bg-[var(--bg-surface2)] p-3 text-xs text-[var(--text-2)]">TikTok will deliver this video to your inbox. Open TikTok to choose privacy, review, and finish publishing.</p>
        {creatorLoading && <p role="status" className="mt-2 text-xs text-[var(--text-2)]">Checking account upload limit…</p>}
        {creatorError && <p role="alert" className="mt-2 text-xs text-rose-300">{creatorError}</p>}
        {creatorInfo && <p className="mt-2 text-[11px] text-[var(--text-3)]">{creatorInfo.nickname || creatorInfo.username || 'Connected creator'} · Max duration {creatorInfo.maxVideoDurationSeconds}s.</p>}
        {creatorInfo && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds && <p role="alert" className="mt-1 text-xs text-rose-300">This export is {itemDurationSeconds}s, longer than this account’s {creatorInfo.maxVideoDurationSeconds}s limit.</p>}
      </div>
    </div>
  );
}
