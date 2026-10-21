// Reads what the editor needs to know about a picked file. Browser only.

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
}

export function isVideoFile(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

export function probeVideo(url: string, name: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    const cleanup = () => { probe.removeAttribute('src'); probe.load(); };
    probe.onloadedmetadata = () => {
      const { duration, videoWidth: width, videoHeight: height } = probe;
      cleanup();
      if (!Number.isFinite(duration) || duration < 0.5 || !width || !height) reject(new Error(`${name} has no readable video.`));
      else resolve({ duration, width, height });
    };
    probe.onerror = () => { cleanup(); reject(new Error(`${name} could not be read by this browser. Try an MP4 (H.264) or WebM video.`)); };
    probe.src = url;
  });
}

/** A small JPEG of one frame, for clip tiles. */
export function grabFrame(url: string, time: number, width = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    const cleanup = () => { video.removeAttribute('src'); video.load(); };
    video.onloadedmetadata = () => { video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05)); };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(width * video.videoHeight / Math.max(1, video.videoWidth)));
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      cleanup();
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    video.onerror = () => { cleanup(); reject(new Error('Could not read a frame.')); };
    video.src = url;
  });
}

export function isAudioFile(file: File) {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(file.name);
}

export function probeAudio(url: string, name: string): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('audio');
    probe.preload = 'metadata';
    const cleanup = () => { probe.removeAttribute('src'); probe.load(); };
    probe.onloadedmetadata = () => {
      const { duration } = probe;
      cleanup();
      if (!Number.isFinite(duration) || duration < 0.5) reject(new Error(`${name} has no readable audio.`));
      else resolve({ duration });
    };
    probe.onerror = () => { cleanup(); reject(new Error(`${name} could not be read by this browser. Try an MP3 or M4A file.`)); };
    probe.src = url;
  });
}
