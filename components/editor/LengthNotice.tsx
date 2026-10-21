'use client';

import { duration, formatTimecode } from '../../lib/editor/timeline';
import { useEditor } from './EditorProvider';

/** Explains the format's length limit before export would refuse it. */
export default function LengthNotice() {
  const { project, format } = useEditor();
  const total = duration(project);
  if (format.maxSeconds === null || total <= format.maxSeconds) return null;
  return (
    <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300" role="status">
      Your {format.label} is {formatTimecode(total)} long. A {format.label} can be up to {formatTimecode(format.maxSeconds)}: trim or delete clips to fit.
    </p>
  );
}

export function isOverLength(total: number, maxSeconds: number | null) {
  return maxSeconds !== null && total > maxSeconds;
}
