import type { Segment, VizConfig, SRTCue } from '../types';
import { SPECTRUM_BANDS, renderShortsFrame } from './canvasRenderer';

export function isWebCodecsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as any).VideoEncoder !== 'undefined' &&
    typeof (window as any).AudioEncoder !== 'undefined' &&
    typeof (window as any).VideoFrame    !== 'undefined' &&
    typeof (window as any).AudioData     !== 'undefined'
  );
}

// Minimal Cooley–Tukey in-place FFT (power-of-two only)
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len >> 1; j++) {
        const uRe = re[i + j],        uIm = im[i + j];
        const vRe = re[i + j + (len>>1)] * curRe - im[i + j + (len>>1)] * curIm;
        const vIm = re[i + j + (len>>1)] * curIm + im[i + j + (len>>1)] * curRe;
        re[i + j]            = uRe + vRe;  im[i + j]            = uIm + vIm;
        re[i + j + (len>>1)] = uRe - vRe;  im[i + j + (len>>1)] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm     = curRe * wIm + curIm * wRe;
        curRe     = nRe;
      }
    }
  }
}

function computeSpectrumAt(audioBuffer: AudioBuffer, absoluteTimeS: number, smoothed: Float32Array): { spectrum: Float32Array; bass: number } {
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 2048;
  const center = Math.floor(absoluteTimeS * sampleRate);
  const start  = Math.max(0, center - fftSize / 2);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < fftSize; i++) {
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      const idx  = start + i;
      re[i] += (idx < data.length ? data[idx] : 0) * hann / audioBuffer.numberOfChannels;
    }
  }

  fft(re, im);

  const usable = Math.floor(fftSize * 0.35);
  let bassSum  = 0;

  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const lo = Math.floor(1 + (i / SPECTRUM_BANDS) * (usable - 1));
    const hi = Math.max(lo + 1, Math.floor(1 + ((i + 1) / SPECTRUM_BANDS) * (usable - 1)));
    let mag  = 0;
    for (let b = lo; b < hi; b++) {
      mag += Math.sqrt(re[b] * re[b] + im[b] * im[b]) / (fftSize / 2);
    }
    const avg     = mag / (hi - lo);
    const boosted = Math.min(1, Math.max(0.04, Math.log1p(avg * 120) / 3.2));
    smoothed[i]   = 0.55 * boosted + 0.45 * smoothed[i];
    if (i < 6) bassSum += smoothed[i];
  }

  return { spectrum: smoothed, bass: Math.min(1, (bassSum / 6) * 1.15) };
}

export interface WebCodecsEncodeOptions {
  canvas:       HTMLCanvasElement;
  audioBuffer:  AudioBuffer;
  segment:      Segment;
  vizConfig:    VizConfig;
  srtCues:      SRTCue[];
  coverImage:   HTMLImageElement | null;
  blurredBg:    HTMLCanvasElement | null;
  titleText:    string;
  artistText:   string;
  onProgress:   (pct: number) => void;
}

export async function encodeSegmentWebCodecs(opts: WebCodecsEncodeOptions): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const target = new ArrayBufferTarget();
  const muxer  = new Muxer({
    target,
    video: { codec: 'avc', width: opts.canvas.width, height: opts.canvas.height },
    audio: { codec: 'aac', sampleRate: opts.audioBuffer.sampleRate, numberOfChannels: opts.audioBuffer.numberOfChannels },
    fastStart: 'in-memory',
  });

  let encodeErr: Error | null = null;

  const videoEncoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error:  (e: Error) => { encodeErr = e; },
  });
  videoEncoder.configure({
    codec:     'avc1.640028',
    width:     opts.canvas.width,
    height:    opts.canvas.height,
    bitrate:   opts.vizConfig.exportQuality,
    framerate: 30,
  });

  const audioEncoder = new (window as any).AudioEncoder({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error:  (e: Error) => { encodeErr = e; },
  });
  audioEncoder.configure({
    codec:            'mp4a.40.2',
    sampleRate:       opts.audioBuffer.sampleRate,
    numberOfChannels: opts.audioBuffer.numberOfChannels,
    bitrate:          192_000,
  });

  const ctx         = opts.canvas.getContext('2d')!;
  const fps         = 30;
  const totalFrames = Math.ceil(opts.segment.duration * fps);
  const smoothed    = new Float32Array(SPECTRUM_BANDS).fill(0.05);

  for (let i = 0; i < totalFrames; i++) {
    if (encodeErr) throw encodeErr;

    const timeS  = i / fps;
    const absT   = opts.segment.start + timeS;
    const tsUs   = Math.round(timeS * 1_000_000);

    const { spectrum, bass } = computeSpectrumAt(opts.audioBuffer, absT, smoothed);
    renderShortsFrame(ctx, timeS, opts.segment.duration, spectrum, bass, {
      blurredBgCanvas: opts.blurredBg,
      coverImage:      opts.coverImage,
      vizConfig:       opts.vizConfig,
      srtCues:         opts.srtCues,
      segmentOffset:   opts.segment.start,
      titleText:       opts.titleText,
      artistText:      opts.artistText,
    });

    const frame = new (window as any).VideoFrame(opts.canvas, {
      timestamp: tsUs,
      duration:  Math.round(1_000_000 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();

    if (i % 15 === 0) {
      opts.onProgress(Math.round((i / totalFrames) * 75));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const sr         = opts.audioBuffer.sampleRate;
  const startSamp  = Math.floor(opts.segment.start * sr);
  const numSamples = Math.ceil(opts.segment.duration * sr);
  const chunkSz    = 4096;

  for (let offset = 0; offset < numSamples; offset += chunkSz) {
    if (encodeErr) throw encodeErr;
    const frames = Math.min(chunkSz, numSamples - offset);
    const numCh  = opts.audioBuffer.numberOfChannels;
    const planar = new Float32Array(frames * numCh);
    for (let c = 0; c < numCh; c++) {
      const src = opts.audioBuffer.getChannelData(c);
      planar.set(src.subarray(startSamp + offset, startSamp + offset + frames), c * frames);
    }
    const audioData = new (window as any).AudioData({
      format:           'f32-planar',
      sampleRate:       sr,
      numberOfFrames:   frames,
      numberOfChannels: numCh,
      timestamp:        Math.round((offset / sr) * 1_000_000),
      data:             planar,
    });
    audioEncoder.encode(audioData);
    audioData.close();
    opts.onProgress(75 + Math.round((offset / numSamples) * 22));
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  if (encodeErr) throw encodeErr;

  muxer.finalize();
  opts.onProgress(100);
  return new Blob([target.buffer], { type: 'video/mp4' });
}
