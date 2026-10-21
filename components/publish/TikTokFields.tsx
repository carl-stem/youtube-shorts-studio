'use client';

export interface TikTokCreatorInfo {
  username?: string;
  nickname?: string;
  privacyOptions: string[];
  maxVideoDurationSeconds: number;
}

interface Props {
  creatorInfo: TikTokCreatorInfo | null;
  creatorLoading: boolean;
  creatorError: string;
  itemDurationSeconds: number;
}

export default function TikTokFields({ creatorInfo, creatorLoading, creatorError, itemDurationSeconds }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="rounded-lg bg-[var(--bg-surface2)] p-3 text-xs text-[var(--text-2)]">TikTok will deliver this video to your TikTok inbox as a draft. Open the TikTok app to add a caption, choose who can see it, and post it.</p>
        {creatorLoading && <p role="status" className="mt-2 text-xs text-[var(--text-2)]">Checking account upload limit…</p>}
        {creatorError && <p role="alert" className="mt-2 text-xs text-rose-300">{creatorError}</p>}
        {creatorInfo && <p className="mt-2 text-[11px] text-[var(--text-3)]">{creatorInfo.nickname || creatorInfo.username || 'Connected creator'} · Max duration {creatorInfo.maxVideoDurationSeconds}s.</p>}
        {creatorInfo && itemDurationSeconds > creatorInfo.maxVideoDurationSeconds && <p role="alert" className="mt-1 text-xs text-rose-300">This export is {itemDurationSeconds}s, longer than this account’s {creatorInfo.maxVideoDurationSeconds}s limit.</p>}
      </div>
    </div>
  );
}
