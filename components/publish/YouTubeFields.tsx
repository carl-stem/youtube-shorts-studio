'use client';
import { YOUTUBE_CATEGORY_IDS } from '../../lib/youtubeMetadata';
import { DESCRIPTION_MAX, TITLE_MAX, effectivePrivacy, minScheduleValue, type Privacy, type YouTubeForm } from '../../lib/publish/youtubeDraft';

interface Props {
  form: YouTubeForm;
  onChange: (patch: Partial<YouTubeForm>) => void;
  shortsCandidate: boolean;
  thumbnail: { name: string; previewUrl: string } | null;
  thumbnailBusy: boolean;
  thumbnailError: string;
  onThumbnailPick: (file: File | null) => void;
  disabled: boolean;
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-surface2)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition disabled:opacity-60';
const labelCls = 'block text-xs text-[var(--text-2)] mb-1';
const categories = Object.entries(YOUTUBE_CATEGORY_IDS).sort((a, b) => a[1].localeCompare(b[1]));

export default function YouTubeFields({ form, onChange, shortsCandidate, thumbnail, thumbnailBusy, thumbnailError, onThumbnailPick, disabled }: Props) {
  const scheduled = !!form.scheduleAt;
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <div>
        <label className={labelCls} htmlFor="yt-title">Title</label>
        <input id="yt-title" className={inputCls} value={form.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={TITLE_MAX} />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className={labelCls} htmlFor="yt-description">Description</label>
          <span className="text-[10px] text-[var(--text-3)] mono">{form.description.length}/{DESCRIPTION_MAX}</span>
        </div>
        <textarea id="yt-description" className={`${inputCls} resize-y h-24`} value={form.description} maxLength={DESCRIPTION_MAX} onChange={(e) => onChange({ description: e.target.value })} />
        <p className="mt-1 text-[11px] text-[var(--text-3)]">
          Add chapters: put each start time on its own line, beginning with <span className="mono">0:00 Intro</span>. YouTube needs at least 3 chapters, each 10 seconds or longer.
        </p>
      </div>

      {shortsCandidate && (
        <label className="flex items-start gap-2 text-xs text-[var(--text-2)]">
          <input type="checkbox" className="mt-0.5" checked={form.addShortsTag} onChange={(e) => onChange({ addShortsTag: e.target.checked })} />
          <span>Add <span className="mono">#Shorts</span> to the description (optional — YouTube already treats vertical videos up to 3 minutes as Shorts).</span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="yt-tags">Tags (comma-separated)</label>
          <input id="yt-tags" className={inputCls} value={form.tags} onChange={(e) => onChange({ tags: e.target.value })} />
        </div>
        <div>
          <label className={labelCls} htmlFor="yt-category">Category</label>
          <select id="yt-category" className={inputCls} value={form.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })}>
            {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </div>

      <div role="radiogroup" aria-labelledby="yt-kids-label" aria-required="true" className="rounded-lg border border-[var(--border)] p-3">
        <p id="yt-kids-label" className="text-xs font-semibold text-[var(--text-1)]">Is this video made for kids? <span className="text-rose-400">(required)</span></p>
        <p className="mt-0.5 text-[11px] text-[var(--text-3)]">YouTube requires this answer by law. Videos made for kids have comments and some features turned off.</p>
        <div className="mt-2 flex gap-4 text-xs text-[var(--text-2)]">
          <label className="flex items-center gap-1.5"><input type="radio" name="yt-kids" checked={form.madeForKids === 'yes'} onChange={() => onChange({ madeForKids: 'yes' })} /> Yes, it’s made for kids</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="yt-kids" checked={form.madeForKids === 'no'} onChange={() => onChange({ madeForKids: 'no' })} /> No, it’s not made for kids</label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="yt-privacy">Who can watch</label>
          <select id="yt-privacy" className={inputCls} value={effectivePrivacy(form)} disabled={scheduled} onChange={(e) => onChange({ privacy: e.target.value as Privacy })}>
            <option value="private">Only me (private)</option>
            <option value="unlisted">Anyone with the link</option>
            <option value="public">Everyone (public)</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="yt-schedule">Go public later (optional)</label>
          <input id="yt-schedule" type="datetime-local" className={inputCls} value={form.scheduleAt} min={minScheduleValue(Date.now())} onChange={(e) => onChange({ scheduleAt: e.target.value })} />
        </div>
      </div>
      {scheduled && (
        <p className="text-[11px] text-sky-300">
          Scheduled videos stay private until the time you picked (your local time), then YouTube makes them public. <button type="button" className="underline" onClick={() => onChange({ scheduleAt: '' })}>Remove schedule</button>
        </p>
      )}

      <div>
        <label className={labelCls} htmlFor="yt-thumbnail">Thumbnail (optional)</label>
        <div className="flex items-center gap-3">
          {thumbnail && <img src={thumbnail.previewUrl} alt="Selected thumbnail" className="h-12 w-auto rounded border border-[var(--border)]" />}
          <input id="yt-thumbnail" type="file" accept="image/jpeg,image/png,image/webp" className="text-xs text-[var(--text-2)]" onChange={(e) => { onThumbnailPick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          {thumbnail && <button type="button" className="text-xs underline text-[var(--text-2)]" onClick={() => onThumbnailPick(null)}>Remove</button>}
        </div>
        {thumbnailBusy && <p className="mt-1 text-[11px] text-[var(--text-3)]">Preparing image…</p>}
        {thumbnailError && <p role="alert" className="mt-1 text-[11px] text-rose-300">{thumbnailError}</p>}
        <p className="mt-1 text-[11px] text-[var(--text-3)]">We shrink it to a JPEG under 2 MB. Custom thumbnails only work on verified YouTube accounts.</p>
      </div>
    </fieldset>
  );
}
