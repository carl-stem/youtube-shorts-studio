// Real-time export: plays the storyline with SequencePlayer and records the
// canvas plus the Web Audio mix. Recording pauses while the next clip loads or
// the tab is hidden, so neither adds dead time to the file.

import { getSupportedMimeType, type CodecInfo } from '../mediaCodec';
import type { Seconds } from '../editor/model';
import type { SequencePlayer } from './sequencePlayer';

export interface RecordOptions {
  player: SequencePlayer;
  canvas: HTMLCanvasElement;
  totalSeconds: Seconds;
  fps: number;
  videoBitsPerSecond: number;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

export interface RecordResult {
  blob: Blob;
  format: CodecInfo;
}

export function canRecordInBrowser(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && typeof AudioContext !== 'undefined'
    && !!getSupportedMimeType().mime;
}

export async function recordSequence(options: RecordOptions): Promise<RecordResult> {
  const { player, canvas, totalSeconds, signal } = options;
  const format = getSupportedMimeType();
  if (!format.mime || !canRecordInBrowser()) throw new Error('This browser cannot export video. Try current Chrome, Edge, or Safari.');
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');

  const audio = player.audioStream();
  await player.seek(0);
  const canvasStream = canvas.captureStream(options.fps);
  const recorder = new MediaRecorder(
    new MediaStream([...canvasStream.getVideoTracks(), ...audio.getAudioTracks()]),
    { mimeType: format.mime, videoBitsPerSecond: options.videoBitsPerSecond },
  );
  const chunks: Blob[] = [];
  const cleanups: Array<() => void> = [];

  return new Promise<RecordResult>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      canvasStream.getTracks().forEach((track) => track.stop());
      if (error) {
        player.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        reject(error);
        return;
      }
      const blob = new Blob(chunks, { type: format.mime });
      if (!blob.size) reject(new Error('The browser produced an empty video. Try again or use another browser.'));
      else resolve({ blob, format });
    };
    const pauseRecording = () => { if (recorder.state === 'recording') recorder.pause(); };
    const resumeRecording = () => { if (recorder.state === 'paused') recorder.resume(); };

    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => finish(new Error('The browser stopped the recording. Try again.'));
    recorder.onstop = () => finish(null);

    cleanups.push(
      // The recorder starts paused and only runs while the video is really moving.
      player.on('playing', (value) => (value ? resumeRecording() : pauseRecording())),
      player.on('time', (t) => options.onProgress(Math.min(1, Number(t) / Math.max(totalSeconds, 0.001)))),
      player.on('stall', (stalled) => (stalled ? pauseRecording() : resumeRecording())),
      player.on('ended', () => { if (recorder.state !== 'inactive') recorder.stop(); }),
      player.on('error', (message) => finish(new Error(String(message)))),
    );
    const onAbort = () => finish(new DOMException('Export cancelled', 'AbortError'));
    signal.addEventListener('abort', onAbort);
    cleanups.push(() => signal.removeEventListener('abort', onAbort));
    const onVisibility = () => {
      if (document.hidden) player.pause();
      else void player.play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    recorder.start(250);
    recorder.pause();
    void player.play();
  });
}
