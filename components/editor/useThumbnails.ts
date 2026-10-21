'use client';

import { useEffect, useRef, useState } from 'react';
import type { Id, Project } from '../../lib/editor/model';
import { grabFrame } from '../../lib/media/probe';

export const thumbnailKey = (mediaId: Id, time: number) => `${mediaId}@${time.toFixed(1)}`;

/** First-frame pictures for clip tiles, made one at a time in the background. */
export function useThumbnails(project: Project, mediaUrl: (id: Id) => string | null) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const wanted = project.story
      .map((clip) => ({ key: thumbnailKey(clip.mediaId, clip.in), mediaId: clip.mediaId, time: clip.in }))
      .filter((item) => !requested.current.has(item.key));
    if (!wanted.length) return;
    (async () => {
      for (const item of wanted) {
        if (cancelled) return;
        if (requested.current.has(item.key)) continue;
        const url = mediaUrl(item.mediaId);
        if (!url) continue;
        requested.current.add(item.key);
        try {
          const image = await grabFrame(url, item.time);
          setThumbs((previous) => ({ ...previous, [item.key]: image }));
        } catch {
          // A missing picture is fine: the tile shows its number instead.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [project.story, mediaUrl]);

  return thumbs;
}
