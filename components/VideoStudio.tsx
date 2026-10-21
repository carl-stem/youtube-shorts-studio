'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AccountStatus, DownloadItem, SRTCue, VideoFilter } from '../types';
import { extractZipMedia, listZipMedia, parseCaptionFile, VIDEO_ZIP_LIMITS, videoMime } from '../lib/videoAssets';
import type { ZipMediaCandidate } from '../lib/videoAssets';
import { getSupportedMimeType } from '../lib/mediaCodec';
import PublishClip from './PublishClip';

interface VideoAsset {
  id: string;
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
}

interface VideoClip {
  id: string;
  assetId: string;
  start: number;
  end: number;
  framing: 'fill' | 'fit';
  zoom: number;
  panX: number;
  panY: number;
  title: string;
  captions: SRTCue[];
  filter: VideoFilter;
}

interface ZipReview {
  file: File;
  candidates: ZipMediaCandidate[];
  selected: Set<string>;
}

const MAX_VIDEO_BYTES = VIDEO_ZIP_LIMITS.fileBytes;
const MAX_ASSETS = VIDEO_ZIP_LIMITS.videos;
const MAX_CLIP_SECONDS = 180;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const inputClass = 'w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-indigo-500';
const buttonClass = 'rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-1)] transition hover:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40';
const VIDEO_STEPS = [
  { number: 1, title: 'Add video', short: 'Import' },
  { number: 2, title: 'Choose a moment', short: 'Trim' },
  { number: 3, title: 'Make it yours', short: 'Style' },
  { number: 4, title: 'Review & export', short: 'Export' },
] as const;

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

function loadVideo(file: File): Promise<VideoAsset> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_BYTES) {
      reject(new Error(`${file.name} exceeds the ${MAX_VIDEO_BYTES / 1024 / 1024} MB per-video limit.`));
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      const width = probe.videoWidth;
      const height = probe.videoHeight;
      probe.removeAttribute('src');
      probe.load();
      if (!Number.isFinite(duration) || duration < 0.5 || !width || !height) {
        URL.revokeObjectURL(url);
        reject(new Error(`${file.name} has invalid video metadata.`));
        return;
      }
      resolve({ id: makeId(), file, url, duration, width, height });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read by this browser. Try an MP4 (H.264) or WebM video.`));
    };
    probe.src = url;
  });
}

function drawVerticalFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  clip: VideoClip,
  captions: SRTCue[],
) {
  if (!canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#080a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
    const fitScale = clip.framing === 'fill'
      ? Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
      : Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const scale = fitScale * (clip.framing === 'fill' ? clip.zoom : 1);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    const x = (canvas.width - drawWidth) / 2 + (clip.framing === 'fill' ? clip.panX * Math.max(0, drawWidth - canvas.width) / 2 : 0);
    const y = (canvas.height - drawHeight) / 2 + (clip.framing === 'fill' ? clip.panY * Math.max(0, drawHeight - canvas.height) / 2 : 0);
    const filters: Record<VideoFilter, string> = {
      original: 'none', warm: 'sepia(0.22) saturate(1.2) hue-rotate(-8deg)',
      cool: 'saturate(0.9) hue-rotate(12deg) brightness(1.04)',
      monochrome: 'grayscale(1)', vivid: 'saturate(1.45) contrast(1.08)',
    };
    ctx.save();
    ctx.filter = filters[clip.filter] ?? 'none';
    ctx.drawImage(video, x, y, drawWidth, drawHeight);
    ctx.restore();
  }
  if (clip.title.trim()) {
    ctx.save();
    ctx.font = '700 64px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const maxWidth = canvas.width - 120;
    const words = clip.title.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    const top = 150;
    const lineHeight = 78;
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    const boxHeight = lines.length * lineHeight + 40;
    ctx.beginPath();
    ctx.roundRect(48, top - 22, canvas.width - 96, boxHeight, 24);
    ctx.fill();
    ctx.fillStyle = '#fff';
    lines.forEach((text, index) => ctx.fillText(text, canvas.width / 2, top + index * lineHeight, maxWidth));
    ctx.restore();
  }
  const activeCue = captions.find((cue) => video.currentTime >= cue.start && video.currentTime < cue.end);
  if (activeCue?.text) {
    ctx.save();
    ctx.font = '600 48px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const caption = activeCue.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const maxWidth = canvas.width - 140;
    const words = caption.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    const y = canvas.height - 390;
    const lineHeight = 60;
    const boxHeight = lines.length * lineHeight + 46;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.beginPath();
    ctx.roundRect(48, y - boxHeight / 2, canvas.width - 96, boxHeight, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    lines.forEach((text, index) => ctx.fillText(text, canvas.width / 2, y - (lines.length - 1) * lineHeight / 2 + index * lineHeight, maxWidth));
    ctx.restore();
  }
}

export default function VideoStudio({ accounts }: { accounts: AccountStatus | null }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState('');
  const [zipReview, setZipReview] = useState<ZipReview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('Ready to export');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [captionsFileName, setCaptionsFileName] = useState('');
  const [outputFormat, setOutputFormat] = useState({ mime: '', ext: 'webm', label: 'WebM' });
  const [unsupportedExport, setUnsupportedExport] = useState(false);
  const [audioCaptureSupported, setAudioCaptureSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const zipPickerRef = useRef<HTMLInputElement>(null);
  const captionPickerRef = useRef<HTMLInputElement>(null);
  const cancelExportRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.assetId) ?? null : null;
  const selectedClipRef = useRef<VideoClip | null>(selectedClip);
  const videoPlaybackRef = useRef<{ objectUrl: string; promise: Promise<void> } | null>(null);
  selectedClipRef.current = selectedClip;
  const clipDuration = selectedClip ? Math.max(0, selectedClip.end - selectedClip.start) : 0;
  const totalBytes = useMemo(() => assets.reduce((sum, asset) => sum + asset.file.size, 0), [assets]);
  const ownedAssetUrlsRef = useRef<Set<string>>(new Set());
  const ownedDownloadUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const detected = getSupportedMimeType();
    setOutputFormat(detected);
    const supported = typeof HTMLCanvasElement.prototype.captureStream === 'function';
    setUnsupportedExport(!detected.mime || typeof MediaRecorder === 'undefined' || !supported);
    const probe = document.createElement('video') as HTMLVideoElement & { captureStream?: () => MediaStream; webkitCaptureStream?: () => MediaStream };
    setAudioCaptureSupported(typeof probe.captureStream === 'function' || typeof probe.webkitCaptureStream === 'function');
  }, []);

  useEffect(() => () => {
    ownedAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    ownedDownloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const clip = selectedClipRef.current;
    if (!video || !clip) return;
    for (const canvas of [canvasRef.current, previewCanvasRef.current]) {
      if (canvas) drawVerticalFrame(canvas, video, clip, clip.captions);
    }
  }, []);

  const attachPreviewCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    previewCanvasRef.current = canvas;
    if (canvas) drawFrame();
  }, [drawFrame]);

  useEffect(() => {
    const video = videoRef.current;      if (!video || !selectedAsset || !selectedClip) return;
    setPlaying(false);

    setPlaybackTime(selectedClip.start);
    video.pause();
    if (video.src !== selectedAsset.url) {
      video.src = selectedAsset.url;
      video.load();
      videoPlaybackRef.current = {
        objectUrl: selectedAsset.url,
        promise: new Promise<void>((resolve, reject) => {
                  const ready = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error(`Could not decode ${selectedAsset.file.name}. Try an MP4 (H.264) or WebM file.`)); };
          const cleanup = () => {
            video.removeEventListener('loadeddata', ready);
            video.removeEventListener('error', failed);
          };
          video.addEventListener('loadeddata', ready, { once: true });
          video.addEventListener('error', failed, { once: true });
        }),
      };
    }
    const seekAndDraw = () => {
      if (Math.abs(video.currentTime - selectedClip.start) > 0.05) video.currentTime = selectedClip.start;
      requestAnimationFrame(drawFrame);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekAndDraw();
    else video.addEventListener('loadeddata', seekAndDraw, { once: true });
    return () => video.removeEventListener('loadeddata', seekAndDraw);
  }, [selectedAsset?.id, selectedClip?.id, drawFrame]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame, selectedClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;
    let frame = 0;
    let interval = 0;
    const tick = () => {
      drawFrame();
      if (!video.paused && !video.ended && video.currentTime < selectedClip.end) frame = requestAnimationFrame(tick);
    };
    if (playing) {
      frame = requestAnimationFrame(tick);
      interval = window.setInterval(() => setPlaybackTime(video.currentTime), 120);
    } else {
      drawFrame();
    }
    return () => { cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, [playing, drawFrame, selectedClip?.end]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;
    const onTimeUpdate = () => {
      setPlaybackTime(video.currentTime);
      if (video.currentTime >= selectedClip.end) {
        video.pause();
        setPlaying(false);
        video.currentTime = selectedClip.end;
        drawFrame();
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [selectedClip?.end, drawFrame]);

  const addVideoFiles = useCallback(async (files: File[], defaultCaptions: SRTCue[] = []) => {
    const incoming = files.filter(isVideoFile);
    const unsupportedCount = files.length - incoming.length;
    if (incoming.length === 0) {
      setError('Choose a supported video file (.mp4, .webm, .mov, or .m4v).');
      return;
    }
    if (assets.length >= MAX_ASSETS) {
      setError(`A project can contain up to ${MAX_ASSETS} video files.`);
      return;
    }
    setError('');
    setImporting(true);
    const loaded: VideoAsset[] = [];
    const failures: string[] = [];
    let acceptedBytes = totalBytes;
    for (const file of incoming) {
      if (assets.length + loaded.length >= MAX_ASSETS) {
        failures.push(`Only ${MAX_ASSETS} videos can be added to one project.`);
        break;
      }
      if (acceptedBytes + file.size > VIDEO_ZIP_LIMITS.expandedBytes) {
        failures.push(`${file.name} was skipped because this project is limited to ${VIDEO_ZIP_LIMITS.expandedBytes / 1024 / 1024} MB of video.`);
        continue;
      }
      try {
        const asset = await loadVideo(file);
        loaded.push(asset);
        acceptedBytes += file.size;
      } catch (e) {
        failures.push(e instanceof Error ? e.message : `${file.name} could not be imported.`);
      }
    }
    if (loaded.length) {
      loaded.forEach((asset) => ownedAssetUrlsRef.current.add(asset.url));
      const newClips = loaded.map((asset) => ({
        id: makeId(), assetId: asset.id, start: 0, end: Math.min(asset.duration, 60),
        framing: 'fill' as const, zoom: 1, panX: 0, panY: 0,
        title: asset.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), captions: defaultCaptions, filter: 'original' as VideoFilter,
      }));
      setAssets((previous) => [...previous, ...loaded]);
      setClips((previous) => [...previous, ...newClips]);
      setSelectedClipId((previous) => previous || newClips[0].id);
      setFurthestStep((step) => Math.max(step, 2));
      setNotice(`${loaded.length} video${loaded.length === 1 ? '' : 's'} ready in your project.`);
    }
    const allFailures = [...failures, ...(unsupportedCount ? [`${unsupportedCount} unsupported file${unsupportedCount === 1 ? '' : 's'} skipped.`] : [])];
    if (allFailures.length) setError(allFailures.join(' '));
    setImporting(false);
  }, [assets.length, totalBytes]);

  const onPickVideos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addVideoFiles(files);
  };

  const inspectZip = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setNotice(''); setImporting(true);
    try {
      const candidates = await listZipMedia(file);
      if (!candidates.length) throw new Error('No supported video or caption files were found in that ZIP.');
      const defaultSelected = new Set(candidates.filter((candidate) => candidate.kind === 'video').map((candidate) => candidate.name));
      setZipReview({ file, candidates, selected: defaultSelected });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not inspect this ZIP.');
    } finally {
      setImporting(false);
    }
  };

  const toggleZipEntry = (name: string) => {
    setZipReview((review) => {
      if (!review) return review;
      const selected = new Set(review.selected);
      if (selected.has(name)) selected.delete(name); else selected.add(name);
      return { ...review, selected };
    });
  };

  const importZipSelection = async () => {
    if (!zipReview) return;
    const selected = zipReview.candidates.filter((candidate) => zipReview.selected.has(candidate.name));
    const videos = selected.filter((candidate) => candidate.kind === 'video');
    const captions = selected.filter((candidate) => candidate.kind === 'captions');
    if (!videos.length) { setError('Choose at least one video from the ZIP.'); return; }
    if (assets.length + videos.length > MAX_ASSETS) { setError(`A project can contain up to ${MAX_ASSETS} video files.`); return; }
    setImporting(true); setError('');
    try {
      const extracted = await extractZipMedia(zipReview.file, [...videos, ...captions]);
      const files = extracted.filter((item) => item.kind === 'video').map((item) => item.file);
      const captionItems = extracted.filter((item) => item.kind === 'captions');
      const cues = (await Promise.all(captionItems.map(async (item) => parseCaptionFile(await item.file.text()))))
        .flat()
        .sort((a, b) => a.start - b.start);
      if (captionItems.length && cues.length === 0) setError(`No valid captions were found in the selected caption files.`);
      if (captionItems.length && cues.length) setCaptionsFileName(captionItems.map((item) => item.file.name).join(', '));
      await addVideoFiles(files, cues);
      setZipReview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not extract the selected ZIP files.');
    } finally {
      setImporting(false);
    }
  };

  const updateClip = (patch: Partial<VideoClip>) => {
    if (!selectedClip) return;
    setClips((previous) => previous.map((clip) => clip.id === selectedClip.id ? { ...clip, ...patch } : clip));
  };

  const removeAsset = (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (asset) {
      URL.revokeObjectURL(asset.url);
      ownedAssetUrlsRef.current.delete(asset.url);
    }

    const removedClips = clips.filter((clip) => clip.assetId === assetId);
    const remainingClips = clips.filter((clip) => clip.assetId !== assetId);
    if (removedClips.some((clip) => clip.id === selectedClipId)) setSelectedClipId(remainingClips[0]?.id ?? '');
    if (!remainingClips.length) { setCurrentStep(1); setFurthestStep(1); }
    setAssets((previous) => previous.filter((entry) => entry.id !== assetId));
    setClips(remainingClips);
    setNotice('Video removed from this project.');
  };

  const addOutputClip = () => {
    if (!selectedAsset) return;
    const clip: VideoClip = {
      id: makeId(), assetId: selectedAsset.id, start: 0, end: Math.min(selectedAsset.duration, 60),
      framing: 'fill', zoom: 1, panX: 0, panY: 0,
      title: selectedAsset.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), captions: [], filter: 'original',
    };
    setClips((previous) => [...previous, clip]);
    setSelectedClipId(clip.id);
  };

  const importCaptions = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const cues = parseCaptionFile(await file.text());
    if (!cues.length) { setError('No valid SRT or VTT captions were found in that file.'); return; }
    updateClip({ captions: cues });
    setCaptionsFileName(file.name);
    setError('');
    setNotice(`${cues.length} caption cues loaded. Edit the text and timing below.`);
  };

  const editCue = (index: number, patch: Partial<SRTCue>) => {
    if (!selectedClip) return;
    const cues = selectedClip.captions.map((cue, cueIndex) => cueIndex === index ? { ...cue, ...patch } : cue);
    updateClip({ captions: cues });
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;
    if (playing) { video.pause(); setPlaying(false); return; }
    if (video.currentTime < selectedClip.start || video.currentTime >= selectedClip.end) video.currentTime = selectedClip.start;
    try {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        const pending = videoPlaybackRef.current;
        if (!pending || pending.objectUrl !== selectedAsset?.url) throw new Error('The selected video is not ready yet.');
        await pending.promise;
      }
      await video.play(); setPlaying(true);
    }
    catch { setError('This video could not be played in the preview. Try another supported video.'); }  };

  const seekTo = (time: number) => {
    const video = videoRef.current;


    if (!video || !selectedClip) return;
    video.currentTime = Math.max(selectedClip.start, Math.min(selectedClip.end, time));
    setPlaybackTime(video.currentTime);
    const onSeeked = () => drawFrame();
    video.addEventListener('seeked', onSeeked, { once: true });
    drawFrame();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!selectedClip || selectedClip.framing !== 'fill') return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: selectedClip.panX, panY: selectedClip.panY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !selectedClip) return;
    const dx = (event.clientX - dragRef.current.x) / Math.max(1, event.currentTarget.clientWidth) * 2;
    const dy = (event.clientY - dragRef.current.y) / Math.max(1, event.currentTarget.clientHeight) * 2;
    updateClip({ panX: Math.max(-1, Math.min(1, dragRef.current.panX + dx)), panY: Math.max(-1, Math.min(1, dragRef.current.panY + dy)) });
  };

  const exportCurrent = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !selectedClip || !selectedAsset) return;
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      setError('Video export is not supported in this browser. Try current Chrome or Edge on desktop.');
      return;
    }
    const mediaVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream; webkitCaptureStream?: () => MediaStream };
    const capture = mediaVideo.captureStream ?? mediaVideo.webkitCaptureStream;
    if (!capture) {
      setError('This browser cannot include the source video’s audio in an export. Try current Chrome or Edge.');
      return;
    }
    const format = getSupportedMimeType();
    if (!format.mime || !MediaRecorder.isTypeSupported(format.mime)) {
      setError('No supported video export format was found in this browser.');
      return;
    }
    setError(''); setProgress(0); setExporting(true); setExportStatus(`Preparing ${format.label} export…`);
    let recorder: MediaRecorder | null = null;
    let raf = 0;
    let finished = false;
    const canvasStream = canvas.captureStream(30);
    let sourceStream: MediaStream | null = null;
    let outputStream: MediaStream | null = null;
    const complete = (cancelled: boolean, chunks: Blob[]) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      video.pause();
      setPlaying(false);
      setExporting(false);
      for (const track of [...canvasStream.getTracks(), ...(sourceStream?.getTracks() ?? [])]) track.stop();
      cancelExportRef.current = null;
      if (cancelled) { setExportStatus('Export cancelled'); return; }
      const blob = new Blob(chunks, { type: format.mime });
      if (!blob.size) { setError('The browser produced an empty video. Try a shorter clip or a different browser.'); setExportStatus('Export failed'); return; }
      const url = URL.createObjectURL(blob);
      ownedDownloadUrlsRef.current.add(url);
      const safeName = (selectedClip.title || selectedAsset.file.name.replace(/\.[^.]+$/, '') || 'short').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'short';
      const item: DownloadItem = { filename: `${safeName}.${format.ext}`, url, sizeBytes: blob.size, durationSeconds: clipDuration };
      setDownloads((previous) => [...previous, item]);
      setProgress(100);
      setExportStatus(`Export complete · ${format.label}`);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = item.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setNotice(`${item.filename} is ready to download.`);
    };
    try {
      sourceStream = capture ? capture.call(video) : null;
      outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...(sourceStream?.getAudioTracks() ?? [])]);
      recorder = new MediaRecorder(outputStream, { mimeType: format.mime, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (recorder?.state === 'recording') recorder.stop();
        complete(true, []);
        setError('Export stopped because the browser reported a recording error.');
        setExportStatus('Export failed');
      };
      recorder.onstop = () => complete(false, chunks);

      cancelExportRef.current = () => {
        if (recorder?.state === 'recording') recorder.stop();
        complete(true, []);
      };
      video.pause();
      if (video.src !== selectedAsset.url) {
        video.src = selectedAsset.url;
        video.load();
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        const pending = videoPlaybackRef.current;
        if (pending?.objectUrl === selectedAsset.url) await pending.promise;
        else throw new Error('The selected video is not ready. Re-select the clip and try again.');
      }
      video.currentTime = selectedClip.start;
      await new Promise<void>((resolve) => {
        if (Math.abs(video.currentTime - selectedClip.start) < 0.05) resolve();
        else video.addEventListener('seeked', () => resolve(), { once: true });
      });
      drawFrame();
      recorder.start(250);
      if (sourceStream) {
        await video.play();
        setPlaying(true);
      }
      setExportStatus('Rendering your short…');
      const update = () => {
        if (!recorder || recorder.state !== 'recording') return;
        drawFrame();
        const elapsed = sourceStream ? Math.max(0, video.currentTime - selectedClip.start) : Math.min(clipDuration, (performance.now() - renderStartedAt) / 1000);
        setProgress(Math.min(99, Math.round(elapsed / clipDuration * 100)));
        if (elapsed >= clipDuration || (sourceStream && (video.currentTime >= selectedClip.end || video.ended))) {
          video.pause();
          recorder.stop();
          return;
        }
        raf = requestAnimationFrame(update);
      };
      const renderStartedAt = performance.now();
      raf = requestAnimationFrame(update);
      const timeout = window.setTimeout(() => {
        if (!finished && recorder?.state === 'recording') {
          setError('Export timed out. Try a shorter clip or another browser.');
          setExportStatus('Export timed out');
          cancelExportRef.current?.();
        }
      }, (clipDuration + 30) * 1000);
      recorder.addEventListener('stop', () => window.clearTimeout(timeout), { once: true });
      cancelExportRef.current = () => {
        if (recorder?.state === 'recording') recorder.stop();
        complete(true, []);
      };
    } catch (e) {
      if (recorder?.state === 'recording') recorder.stop();
      complete(true, []);
      setError(e instanceof Error ? e.message : 'Could not start video export.');
      setExportStatus('Export failed');
    }
  };

  const downloadAgain = (item: DownloadItem) => {
    const anchor = document.createElement('a');
    anchor.href = item.url; anchor.download = item.filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  };

  const advanceStep = (step: number) => {
    setFurthestStep((furthest) => Math.max(furthest, step));
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToStep = (step: number) => {
    if (step <= furthestStep && (step === 1 || (selectedClip && selectedAsset))) advanceStep(step);
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 via-[var(--bg-surface)] to-fuchsia-500/10 shadow-lg shadow-indigo-900/5">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500">Your video Short, step by step</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight">From raw footage to ready to share</h2>
              <p className="mt-1 text-xs text-[var(--text-2)]">Your videos stay on this device. You can move back and refine any step.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-1.5 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300 sm:self-auto">
              <span aria-hidden="true">✦</span> No editing experience needed
            </div>
          </div>
          <nav aria-label="Video creation steps" className="border-t border-indigo-500/10 bg-[var(--bg-surface)]/60 px-3 py-3 sm:px-6">
            <ol className="flex items-start">
              {VIDEO_STEPS.map((step, index) => {
                const active = currentStep === step.number;
                const complete = step.number < currentStep;
                const available = step.number <= furthestStep && (step.number === 1 || (!!selectedClip && !!selectedAsset));
                return (
                  <li key={step.number} className="flex min-w-0 flex-1 items-start">
                    <button type="button" onClick={() => navigateToStep(step.number)} disabled={!available} aria-current={active ? 'step' : undefined} className={`group flex min-w-0 flex-col items-center gap-1.5 text-center disabled:cursor-not-allowed ${available ? 'cursor-pointer' : 'cursor-default'}`}>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all ${active ? 'scale-110 bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white ring-4 ring-indigo-500/15 shadow-md shadow-indigo-600/20' : complete ? 'bg-emerald-500 text-white' : 'border-2 border-[var(--border)] bg-[var(--bg-surface2)] text-[var(--text-3)]'} ${available && !active ? 'group-hover:border-indigo-400' : ''}`}>{complete ? '✓' : step.number}</span>
                      <span className={`max-w-full truncate text-[10px] font-semibold sm:text-xs ${active ? 'text-indigo-500 dark:text-indigo-300' : complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-3)]'}`}><span className="sm:hidden">{step.short}</span><span className="hidden sm:inline">{step.title}</span></span>
                    </button>
                    {index < VIDEO_STEPS.length - 1 && <span aria-hidden="true" className={`mx-1 mt-[17px] h-0.5 min-w-2 flex-1 rounded-full sm:mx-3 ${complete ? 'bg-gradient-to-r from-emerald-500 to-indigo-500' : 'bg-[var(--border)]'}`} />}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 px-4 py-5 sm:px-6 lg:grid-cols-12 lg:px-8">
        <section className="order-1 space-y-5 lg:col-span-7">
          {currentStep === 1 && <section className="step-enter rounded-2xl border border-indigo-500/15 bg-[var(--bg-surface)] p-5 shadow-xl shadow-indigo-950/5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300"><span>Step 1</span><span className="h-1 w-1 rounded-full bg-indigo-400" />Start with your footage</div>
                <h2 className="font-semibold">Add your videos</h2>
                <p className="mt-1 text-xs text-[var(--text-2)]">MP4, WebM, MOV, or M4V · up to {MAX_VIDEO_BYTES / 1024 / 1024} MB per video · {VIDEO_ZIP_LIMITS.expandedBytes / 1024 / 1024} MB per project</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => pickerRef.current?.click()} disabled={importing || exporting}>Choose videos</button>
                <button className={buttonClass} onClick={() => zipPickerRef.current?.click()} disabled={importing || exporting}>Choose a ZIP folder</button>
              </div>
              <input ref={pickerRef} type="file" accept="video/mp4,video/webm,video/quicktime,.m4v" multiple className="hidden" onChange={onPickVideos} />
              <input ref={zipPickerRef} type="file" accept=".zip,application/zip" className="hidden" onChange={inspectZip} />
            </div>
            <p className="text-xs text-[var(--text-3)]">Files stay on this device during editing and export. Video playback support depends on your browser; MP4 (H.264) is the best first choice.</p>

            {zipReview && (
              <div className="mt-5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Review files in {zipReview.file.name}</h3>
                    <p className="mt-1 text-xs text-[var(--text-2)]">Choose which videos and optional captions to import. Other files are ignored.</p>
                  </div>
                  <button className="text-[var(--text-3)] hover:text-[var(--text-1)]" aria-label="Close ZIP review" onClick={() => setZipReview(null)}>✕</button>
                </div>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {zipReview.candidates.map((candidate) => (
                    <label key={candidate.name} className="flex cursor-pointer items-center gap-3 rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                      <input type="checkbox" checked={zipReview.selected.has(candidate.name)} onChange={() => toggleZipEntry(candidate.name)} />
                      <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                      <span className="text-xs text-[var(--text-3)]">{candidate.kind === 'video' ? 'Video' : 'Captions'} · {(candidate.expandedSize / 1024 / 1024).toFixed(1)} MB</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40" onClick={() => void importZipSelection()} disabled={importing || !Array.from(zipReview.selected).some((name) => zipReview.candidates.find((entry) => entry.name === name)?.kind === 'video')}>{importing ? 'Importing…' : 'Import selected files'}</button>
                  <button className={buttonClass} onClick={() => setZipReview(null)}>Cancel</button>
                </div>
              </div>
            )}

            {assets.length > 0 ? (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-2)]"><span>{assets.length} video{assets.length === 1 ? '' : 's'} · {(totalBytes / 1024 / 1024).toFixed(1)} MB</span><span>Each imported video starts as one editable clip.</span></div>
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">▶</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{asset.file.name}</p><p className="text-xs text-[var(--text-3)]">{asset.width} × {asset.height} · {formatTime(asset.duration)} · {videoMime(asset.file.name)}</p></div>
                    <button className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => removeAsset(asset.id)} disabled={exporting}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border-2 border-dashed border-[var(--border-input)] bg-[var(--bg-surface2)] p-8 text-center">
                <div className="text-3xl">🎞️</div><h3 className="mt-2 text-sm font-semibold">Start with a video you already have</h3><p className="mt-1 text-xs text-[var(--text-2)]">Choose a video or a ZIP archive to see your footage here.</p>
              </div>
            )}
            <div className="mt-5 flex justify-end border-t border-indigo-500/10 pt-4">
              <button type="button" onClick={() => advanceStep(2)} disabled={!assets.length || importing || exporting} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40">{importing ? 'Importing…' : assets.length ? 'Choose a moment →' : 'Add a video to continue'}</button>
            </div>
          </section>}

          {selectedClip && selectedAsset && currentStep === 2 && (
              <section className="step-enter rounded-2xl border border-violet-500/15 bg-[var(--bg-surface)] p-5 shadow-xl shadow-violet-950/5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div><div className="mb-1 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300"><span>Step 2</span><span className="h-1 w-1 rounded-full bg-violet-400" />Find the best moment</div><h2 className="font-semibold">Choose your moment</h2><p className="mt-1 text-xs text-[var(--text-2)]">Play and scrub, then set the beginning and end of your Short.</p></div>
                  <button className={buttonClass} onClick={addOutputClip} disabled={exporting}>+ Add another clip from this video</button>
                </div>
                <label className="mb-3 block text-xs font-medium text-[var(--text-2)]">Clip to edit</label>
                <div className="flex gap-2"><select className={inputClass} value={selectedClip.id} onChange={(event) => setSelectedClipId(event.target.value)} disabled={exporting}>
                  {clips.map((clip, index) => {
                    const asset = assets.find((item) => item.id === clip.assetId);
                    return <option key={clip.id} value={clip.id}>Clip {index + 1} · {clip.title || asset?.file.name}</option>;
                  })}
                </select><button className={buttonClass} onClick={() => { if (clips.length <= 1) return; const remaining = clips.filter((clip) => clip.id !== selectedClip.id); setClips(remaining); setSelectedClipId(remaining[0].id); }} disabled={exporting || clips.length <= 1} title="Keep at least one output clip">Remove clip</button></div>
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="relative w-full max-w-[300px] overflow-hidden rounded-[28px] border-[8px] border-slate-800 bg-black shadow-xl">
                    <canvas ref={canvasRef} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} className={`aspect-[9/16] w-full ${selectedClip.framing === 'fill' ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragRef.current = null; }} aria-label="Vertical video preview; drag to reposition when using Fill" />
                  </div>
                  <div className="flex w-full max-w-[420px] items-center gap-3">
                    <button className={buttonClass} onClick={() => void togglePlayback()}>{playing ? 'Pause' : 'Preview clip'}</button>
                    <input className="min-w-0 flex-1 accent-indigo-500" type="range" min={selectedClip.start} max={selectedClip.end} step={0.05} value={Math.max(selectedClip.start, Math.min(selectedClip.end, playbackTime))} onChange={(event) => seekTo(Number(event.target.value))} aria-label="Scrub video preview" />
                    <span className="mono text-xs text-[var(--text-2)]">{formatTime(playbackTime)}</span>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Start · {selectedClip.start.toFixed(1)}s</label><input className="w-full accent-indigo-500" type="range" min="0" max={Math.max(0, selectedAsset.duration - 0.1)} step="0.1" value={selectedClip.start} onChange={(event) => updateClip({ start: Math.min(Number(event.target.value), selectedClip.end - 0.5) })} aria-label="Clip start time" /></div>
                  <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">End · {selectedClip.end.toFixed(1)}s</label><input className="w-full accent-indigo-500" type="range" min={Math.min(selectedAsset.duration, selectedClip.start + 0.5)} max={selectedAsset.duration} step="0.1" value={selectedClip.end} onChange={(event) => updateClip({ end: Number(event.target.value) })} aria-label="Clip end time" /></div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-2)]"><span>Selected length: <strong className="text-[var(--text-1)]">{clipDuration.toFixed(1)} seconds</strong></span><span>{clipDuration > MAX_CLIP_SECONDS ? `Maximum export length is ${MAX_CLIP_SECONDS} seconds.` : 'Up to 3 minutes per export.'}</span></div>
                <p className="mt-1 text-xs text-[var(--text-3)]">Captions use the source video’s timestamps; trim the range to include the moments you want captioned.</p>
                <div className="mt-5 flex items-center justify-between border-t border-violet-500/10 pt-4"><button type="button" onClick={() => advanceStep(1)} className={buttonClass}>← Add videos</button><button type="button" onClick={() => advanceStep(3)} disabled={exporting} className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40">Style your Short →</button></div>
              </section>
          )}

          {selectedClip && selectedAsset && currentStep === 3 && <>
              <section className="step-enter rounded-2xl border border-fuchsia-500/15 bg-[var(--bg-surface)] p-5 shadow-xl shadow-fuchsia-950/5">
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300"><span>Step 3</span><span className="h-1 w-1 rounded-full bg-fuchsia-400" />Add your style</div><h2 className="font-semibold">Make it yours</h2><p className="mt-1 text-xs text-[var(--text-2)]">Drag the preview to reposition when Fill is selected.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Frame your video</label><select className={inputClass} value={selectedClip.framing} onChange={(event) => updateClip({ framing: event.target.value as VideoClip['framing'], zoom: 1, panX: 0, panY: 0 })}><option value="fill">Fill portrait frame (crop)</option><option value="fit">Fit entire video</option></select></div>
                  <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Color filter</label><select className={inputClass} value={selectedClip.filter} onChange={(event) => updateClip({ filter: event.target.value as VideoFilter })}><option value="original">Original</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="monochrome">Monochrome</option><option value="vivid">Vivid</option></select></div>
                  {selectedClip.framing === 'fill' && <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Zoom · {selectedClip.zoom.toFixed(1)}×</label><div className="flex items-center gap-3"><input className="w-full accent-indigo-500" type="range" min="1" max="2.5" step="0.05" value={selectedClip.zoom} onChange={(event) => updateClip({ zoom: Number(event.target.value) })} aria-label="Video crop zoom" /><button className="text-xs text-indigo-400 hover:text-indigo-300" onClick={() => updateClip({ zoom: 1, panX: 0, panY: 0 })}>Reset frame</button></div></div>}
                  <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Title on video</label><input className={inputClass} maxLength={100} value={selectedClip.title} onChange={(event) => updateClip({ title: event.target.value })} placeholder="Add a short title" /></div>
                  <div className="sm:col-span-2">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><label className="block text-xs font-medium text-[var(--text-2)]">Captions</label><span className="text-[11px] text-[var(--text-3)]">{captionsFileName || `${selectedClip.captions.length} cues`}</span></div><button className={buttonClass} onClick={() => captionPickerRef.current?.click()}>Import SRT / VTT</button><input ref={captionPickerRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={(event) => void importCaptions(event)} /></div>
                    {selectedClip.captions.length > 0 ? <div className="max-h-64 space-y-2 overflow-y-auto">{selectedClip.captions.map((cue, index) => <div key={`${cue.start}-${index}`} className="grid grid-cols-1 gap-2 rounded-xl bg-[var(--bg-surface2)] p-3 sm:grid-cols-[82px_82px_1fr_36px]"><input className={inputClass} type="number" min="0" step="0.1" value={cue.start} aria-label={`Caption ${index + 1} start time`} onChange={(event) => editCue(index, { start: Number(event.target.value) })} /><input className={inputClass} type="number" min="0" step="0.1" value={cue.end} aria-label={`Caption ${index + 1} end time`} onChange={(event) => editCue(index, { end: Number(event.target.value) })} /><input className={inputClass} value={cue.text} aria-label={`Caption ${index + 1} text`} onChange={(event) => editCue(index, { text: event.target.value })} /><button className="rounded-lg text-rose-400 hover:bg-rose-500/10" aria-label={`Delete caption ${index + 1}`} onClick={() => updateClip({ captions: selectedClip.captions.filter((_, cueIndex) => cueIndex !== index) })}>×</button></div>)}</div> : <div className="rounded-xl bg-[var(--bg-surface2)] p-4 text-xs text-[var(--text-3)]">No captions yet. Import an SRT or VTT file to add timed captions.</div>}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-fuchsia-500/10 pt-4"><button type="button" onClick={() => advanceStep(2)} className={buttonClass}>← Choose moment</button><button type="button" onClick={() => advanceStep(4)} disabled={exporting} className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-600/20 transition hover:from-fuchsia-500 hover:to-pink-500 disabled:opacity-40">Review your Short →</button></div>
              </section>
          </>}

          {selectedClip && selectedAsset && currentStep === 4 && <section className="step-enter rounded-2xl border border-emerald-500/15 bg-[var(--bg-surface)] p-5 shadow-xl shadow-emerald-950/5">
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300"><span>Step 4</span><span className="h-1 w-1 rounded-full bg-emerald-400" />Make your final Short</div><h2 className="font-semibold">Review and export</h2><p className="mt-1 text-xs text-[var(--text-2)]">Export records in real time. Keep this tab open until it finishes.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!exporting ? <button className="rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 px-5 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-40" onClick={() => void exportCurrent()} disabled={clipDuration < 0.5 || clipDuration > MAX_CLIP_SECONDS || unsupportedExport || !audioCaptureSupported}>Export this Short · {outputFormat.label}</button> : <button className="rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-500" onClick={() => cancelExportRef.current?.()}>Cancel export</button>}
                  <span role="status" className="text-xs text-[var(--text-2)]">{exportStatus}</span>
                </div>
                {unsupportedExport && <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">Export needs a browser with canvas recording and a supported video codec. Try current Chrome or Edge on desktop.</p>}
                {!audioCaptureSupported && <p className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200">This browser cannot capture source audio for export. Use current Chrome or Edge to export video with its original audio.</p>}
                {exporting && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-[var(--text-2)]"><span>Rendering in real time</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg-surface2)]"><div className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all" style={{ width: `${progress}%` }} /></div></div>}
                {downloads.length > 0 && <div className="mt-4 space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Your exports</h3>{downloads.map((download, index) => <div key={`${download.filename}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-[var(--bg-surface2)] px-3 py-2"><span className="truncate text-xs">{download.filename} · {(download.sizeBytes / 1024 / 1024).toFixed(2)} MB</span><span className="flex shrink-0 items-center gap-2"><PublishClip item={download} accounts={accounts} /><button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500" onClick={() => downloadAgain(download)}>Download</button></span></div>)}{!accounts?.google && !accounts?.tiktok && <p className="text-[11px] text-[var(--text-3)]">To publish, connect YouTube or TikTok with the Accounts button at the top of the page.</p>}</div>}
                <div className="mt-5 flex justify-start border-t border-emerald-500/10 pt-4"><button type="button" onClick={() => advanceStep(3)} className={buttonClass}>← Back to styling</button></div>
              </section>}
        </section>

        <aside className="order-2 space-y-4 lg:sticky lg:top-20 lg:order-2 lg:col-span-5">
          {selectedClip && selectedAsset ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Short preview</h2>
                <span className="text-xs text-[var(--text-3)]">9:16 · {OUTPUT_WIDTH} × {OUTPUT_HEIGHT}</span>
              </div>
              <div className="mt-4 flex justify-center">
                <div className="w-full max-w-[280px] overflow-hidden rounded-[28px] border-[8px] border-slate-800 bg-black shadow-2xl">
                  <canvas ref={attachPreviewCanvas} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} className="aspect-[9/16] w-full" />
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-[var(--text-3)]">Preview includes your crop, {selectedClip.filter} filter, title, and captions.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center lg:sticky lg:top-20">
              <div className="mx-auto flex aspect-[9/16] w-full max-w-[220px] items-center justify-center rounded-[28px] border-[8px] border-slate-800 bg-[var(--bg-surface2)] text-center text-sm text-[var(--text-3)]">
                <div>Choose a video<br />to see your Short</div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-3)]">Your vertical preview appears here.</p>
            </div>
          )}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-2)]"><strong className="text-[var(--text-1)]">A few helpful notes</strong><ul className="mt-2 list-disc space-y-1 pl-4"><li>Preview supports formats your browser can play; MP4/H.264 is the recommended starting point.</li><li>Exports are rendered in real time and can be cancelled.</li><li>Files stay on this device until you choose Publish on a finished export. Publishing sends only that export to the account you pick.</li></ul></div>
        </aside>
      </div>
      <video ref={videoRef} className="hidden" playsInline preload="metadata" onLoadedData={drawFrame} />
      {(notice || error) && <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 space-y-2" aria-live="polite">{notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/95 px-4 py-3 text-sm text-emerald-200 shadow-xl">{notice}<button className="float-right ml-3" aria-label="Dismiss notice" onClick={() => setNotice('')}>✕</button></div>}{error && <div className="rounded-xl border border-rose-500/30 bg-rose-950/95 px-4 py-3 text-sm text-rose-200 shadow-xl">{error}<button className="float-right ml-3" aria-label="Dismiss error" onClick={() => setError('')}>✕</button></div>}</div>}
      <div className="sr-only" aria-live="polite">{importing ? 'Import in progress' : ''}{exporting ? `Exporting ${progress} percent` : ''}</div>
    </div>
  );
}
