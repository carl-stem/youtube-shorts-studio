// A "deck" is one <video> element the player loads clips into. Two decks
// alternate so the next clip is ready before the current one ends.

import type { Id, Seconds } from '../editor/model';

export interface Deck {
  video: HTMLVideoElement;
  clipId: Id | null;
  /** Bumped on every load so a stale load cannot finish into a newer one. */
  token: number;
  loading: Promise<void> | null;
  gain: GainNode | null;
}

export function once(target: EventTarget, ok: string) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { target.removeEventListener(ok, done); target.removeEventListener('error', failed); resolve(); };
    const failed = () => { target.removeEventListener(ok, done); target.removeEventListener('error', failed); reject(new Error('A file could not be read by the browser.')); };
    target.addEventListener(ok, done);
    target.addEventListener('error', failed);
  });
}

/** Loads a clip's file into the deck and seeks to sourceTime; resolves when that frame is ready. */
export async function loadDeck(deck: Deck, clipId: Id, url: string, sourceTime: Seconds) {
  deck.token += 1;
  const token = deck.token;
  deck.clipId = clipId;
  const { video } = deck;
  const task = (async () => {
    if (video.src !== url) { video.src = url; await once(video, 'loadeddata'); }
    else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await once(video, 'loadeddata');
    if (token !== deck.token) return;
    if (Math.abs(video.currentTime - sourceTime) > 0.001) {
      const seeked = once(video, 'seeked');
      video.currentTime = sourceTime;
      await seeked;
    }
  })();
  deck.loading = task;
  try { await task; } finally { if (deck.loading === task) deck.loading = null; }
}
