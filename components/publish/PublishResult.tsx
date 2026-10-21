'use client';

export interface PublishResultState {
  url?: string;
  message?: string;
  error?: string;
  /** Outcome of the optional thumbnail step, shown under the upload result. */
  thumbnailNote?: { ok: boolean; text: string };
}

interface StatusCheck {
  label: string;
  busyLabel: string;
  busy: boolean;
  onCheck: () => void;
}

interface Props {
  result: PublishResultState;
  statusCheck: StatusCheck | null;
}

export default function PublishResult({ result, statusCheck }: Props) {
  return (
    <div role="status" className={`rounded-xl px-4 py-3 text-sm ${result.error ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-200 border border-amber-500/20'}`}>
      {result.error
        ? `Upload failed: ${result.error} Your local export is unchanged.`
        : <>{result.message} {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">View on YouTube →</a>}</>}
      {result.thumbnailNote && <p className={`mt-2 text-xs ${result.thumbnailNote.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{result.thumbnailNote.text}</p>}
      {statusCheck && (
        <button type="button" onClick={statusCheck.onCheck} disabled={statusCheck.busy} className="mt-3 block rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {statusCheck.busy ? statusCheck.busyLabel : statusCheck.label}
        </button>
      )}
    </div>
  );
}
