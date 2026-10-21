// Decides which video a caption file belongs to when both arrive together (ZIP import).

const stem = (path: string) => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '').toLowerCase();

/**
 * Pairs caption files with videos by file name ("talk.srt" → "talk.mp4", also
 * "talk.en.vtt"). With exactly one video, every caption file goes to it.
 * Returns caption name → video name; unmatched captions are left out.
 */
export function pairCaptions(videoNames: string[], captionNames: string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const caption of captionNames) {
    const captionStem = stem(caption);
    const match = videoNames.find((video) => stem(video) === captionStem)
      ?? videoNames.find((video) => captionStem.startsWith(`${stem(video)}.`))
      ?? (videoNames.length === 1 ? videoNames[0] : undefined);
    if (match) pairs.set(caption, match);
  }
  return pairs;
}
