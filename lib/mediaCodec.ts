export interface CodecInfo {
  mime: string;
  ext: string;
  label: string;
}

export function getSupportedMimeType(): CodecInfo {
  if (typeof window === 'undefined') return { mime: '', ext: 'webm', label: 'SSR' };
  const candidates: CodecInfo[] = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4', label: 'MP4 (H.264 / AAC)' },
    { mime: 'video/mp4', ext: 'mp4', label: 'MP4 Container' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM (VP9 / Opus)' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM (VP8 / Opus)' },
    { mime: 'video/webm', ext: 'webm', label: 'WebM Video' },
  ];
  for (const item of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(item.mime)) return item;
  }
  return { mime: '', ext: 'webm', label: 'Default Recorder' };
}
