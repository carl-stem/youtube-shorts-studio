'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Segment, VizConfig, SRTCue, DownloadItem, TrackMeta } from '../types';
import {
  SHORTS_WIDTH, SHORTS_HEIGHT, SPECTRUM_BANDS,
  renderShortsFrame, computeSpectrumFromAnalyser,
  updateBlurredBackground, createDefaultCoverImage,
} from '../lib/canvasRenderer';
import { getSupportedMimeType } from '../lib/mediaCodec';
import { parseSRT } from '../lib/srtParser';
import { serializeProject, downloadProject, loadProjectFromFile } from '../lib/projectSerializer';
import { useToast } from '../hooks/useToast';

import Header from './Header';
import MediaUploader from './MediaUploader';
import TrackSettings from './TrackSettings';
import VisualStylePanel from './VisualStylePanel';
import SegmentEditor from './SegmentEditor';
import ConsoleLog from './ConsoleLog';
import CanvasPreview from './CanvasPreview';
import StepperNav from './StepperNav';
import ExportPanel from './ExportPanel';
import SocialShare from './SocialShare';
import ToastContainer from './Toast';
import SpotifySearch from './SpotifySearch';

// ─── defaults ────────────────────────────────────────────────────────────────

const DEFAULT_VIZ: VizConfig = {
  showTitle: true, showArtist: true, showSpectrum: true,
  showProgress: true, showTimecode: true, showCC: true,
  spectrumStyle: 'bars', colorTheme: 'indigo-pink', bgStyle: 'blur',
  exportQuality: 6000000, ctaText: '', ctaPosition: 'top',
};

const DEFAULT_META: TrackMeta = {
  title: '', artist: '', clipDuration: 58, maxShorts: null,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Studio() {
  // ── asset state (triggers UI updates) ──
  const [audioFile, setAudioFile] = useState<{ name: string; meta: string }>({
    name: 'Choose .WAV or Audio File', meta: 'Click or drag & drop audio',
  });
  const [imageFile, setImageFile] = useState<{ name: string; meta: string }>({
    name: 'Choose Album Cover', meta: 'PNG, JPG, or WEBP',
  });
  const [srtFile, setSrtFile] = useState<{ name: string; meta: string }>({
    name: 'Choose .SRT Subtitle File', meta: 'Optional – for closed captions',
  });

  const [trackMeta, setTrackMeta] = useState<TrackMeta>(DEFAULT_META);
  const [vizConfig, setVizConfig]  = useState<VizConfig>(DEFAULT_VIZ);

  // ── segment state ──
  const [userSegments, setUserSegments]   = useState<Segment[] | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  // ── playback/render state ──
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isRendering, setIsRendering]           = useState(false);
  const [previewTimeStr, setPreviewTimeStr]     = useState('00:00 / 00:58');
  const [progress, setProgress]                 = useState<{ pct: number; status: string }>({ pct: 0, status: 'Ready' });
  const [logs, setLogs]                         = useState<string[]>([
    `[${timestamp()}] Ready. Load a .wav audio file and album cover above to begin.`,
  ]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  // feature support (checked client-side on mount)
  const [canRecord, setCanRecord] = useState<boolean>(true);

  // ── stepper state ──
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // ── toast ──
  const { toasts, toast, dismiss, updateToast } = useToast();

  // ── captioning state ──
  const [isCaptioning, setIsCaptioning] = useState(false);

  // ── canvas & audio refs (animation loop reads these directly) ──
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const blurredBgRef       = useRef<HTMLCanvasElement | null>(null);
  const smoothedSpecRef    = useRef<Float32Array>(new Float32Array(SPECTRUM_BANDS).fill(0.05));
  const animFrameRef       = useRef<number>(0);

  // Audio
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const audioBufferRef     = useRef<AudioBuffer | null>(null);
  const decodedAudioFileRef = useRef<File | null>(null);
  const analyserRef        = useRef<AnalyserNode | null>(null);
  const sourceRef          = useRef<AudioBufferSourceNode | null>(null);
  const previewStartRef    = useRef<number>(0);
  const previewDurRef      = useRef<number>(58);
  const segOffsetRef       = useRef<number>(0);
  const isPlayingRef       = useRef<boolean>(false);
  const isRenderingRef     = useRef<boolean>(false);
  const stopFlagRef        = useRef<boolean>(false);

  // Project file input ref
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // Render-loop mirror refs (avoid stale closures)
  const coverRef           = useRef<HTMLImageElement | null>(null);
  const srtCuesRef         = useRef<SRTCue[]>([]);
  const vizRef             = useRef<VizConfig>(DEFAULT_VIZ);
  const metaRef            = useRef<TrackMeta>(DEFAULT_META);

  // Codec
  const detectedFormat = useRef(
    typeof window !== 'undefined' ? getSupportedMimeType() : { mime: '', ext: 'webm', label: 'webm' },
  ).current;

  // ── keep mirror refs in sync ──
  useEffect(() => { vizRef.current = vizConfig; }, [vizConfig]);
  useEffect(() => { metaRef.current = trackMeta; }, [trackMeta]);

  // ── stepper helpers ──
  const completeStep = (step: number) => {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step]);
    setCurrentStep(step + 1);
  };

  // ── URL step param ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = parseInt(params.get('step') || '1', 10);
    if (s >= 1 && s <= 4) setCurrentStep(s);
  }, []);

  // ── logging ──
  const log = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-300), `[${timestamp()}] ${msg}`]);
  }, []);

  // ── initialise blurred bg canvas + feature detection ──
  useEffect(() => {
    const bg = document.createElement('canvas');
    bg.width = SHORTS_WIDTH; bg.height = SHORTS_HEIGHT;
    blurredBgRef.current = bg;

    createDefaultCoverImage().then((img) => {
      coverRef.current = img;
      updateBlurredBackground(bg, img);
    });

    // Feature-detect export capabilities
    const testCanvas = document.createElement('canvas');
    const supported =
      typeof MediaRecorder !== 'undefined' &&
      typeof testCanvas.captureStream === 'function' &&
      typeof AudioContext !== 'undefined';
    setCanRecord(supported);
  }, []);

  // ── animation loop ──
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx && !isRenderingRef.current) {
        let elapsed = 0;
        let dur = metaRef.current.clipDuration;

        if (isPlayingRef.current && audioCtxRef.current) {
          elapsed = audioCtxRef.current.currentTime - previewStartRef.current;
          if (elapsed >= previewDurRef.current) stopPreviewInternal();
          dur = previewDurRef.current;
        }

        const { spectrum, bass } = computeSpectrumFromAnalyser(analyserRef.current, smoothedSpecRef.current);
        const ts = renderShortsFrame(ctx, elapsed, dur, spectrum, bass, {
          blurredBgCanvas: blurredBgRef.current,
          coverImage: coverRef.current,
          vizConfig: vizRef.current,
          srtCues: srtCuesRef.current,
          segmentOffset: segOffsetRef.current,
          titleText: metaRef.current.title,
          artistText: metaRef.current.artist,
        });
        setPreviewTimeStr(ts);
      }
    }
    animFrameRef.current = requestAnimationFrame(loop);
  }, []); // empty deps – reads only refs

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [loop]);

  // ── pause animation loop when tab is hidden to save battery ──
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
      } else {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loop]);

  // ── preview ──
  const stopPreviewInternal = useCallback(() => {
    try { sourceRef.current?.stop(); } catch (_) {}
    sourceRef.current = null;
    analyserRef.current = null;
    isPlayingRef.current = false;
    setIsPreviewPlaying(false);
  }, []);

  const startPreview = useCallback(async (startOffset: number, clipDur: number) => {
    stopPreviewInternal();
    const buf = audioBufferRef.current;
    if (!buf) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    }
    const ac = audioCtxRef.current!;
    // iOS/Safari: AudioContext starts suspended until a user gesture resumes it
    if (ac.state === 'suspended') await ac.resume().catch(() => {});

    segOffsetRef.current = startOffset;
    const src    = ac.createBufferSource();
    src.buffer   = buf;
    const gain   = ac.createGain();
    const now    = ac.currentTime;
    const fade   = Math.min(0.8, clipDur * 0.15);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(1.0, now + fade);
    gain.gain.setValueAtTime(1.0, now + Math.max(fade, clipDur - fade));
    gain.gain.linearRampToValueAtTime(0.001, now + clipDur);

    const analyser   = ac.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(gain); gain.connect(analyser); analyser.connect(ac.destination);
    src.start(0, startOffset, clipDur);

    sourceRef.current      = src;
    analyserRef.current    = analyser;
    previewStartRef.current = now;
    previewDurRef.current  = clipDur;
    isPlayingRef.current   = true;
    setIsPreviewPlaying(true);

    src.onended = stopPreviewInternal;
    log(`[*] Previewing: ${startOffset.toFixed(1)}s → ${(startOffset + clipDur).toFixed(1)}s`);
  }, [stopPreviewInternal, log]);

  const togglePreview = useCallback(() => {
    if (isRenderingRef.current) return;
    if (isPlayingRef.current) { stopPreviewInternal(); return; }
    const segs = getSegments();
    if (segs.length > 0) startPreview(segs[0].start, segs[0].duration);
    else startPreview(0, trackMeta.clipDuration);
  }, [startPreview, stopPreviewInternal, trackMeta.clipDuration]); // eslint-disable-line

  // ── computed segments ──
  const getSegments = useCallback((): Segment[] => {
    if (userSegments !== null) return userSegments;
    if (!audioBufferRef.current) return [];
    const total   = audioBufferRef.current.duration;
    const dur     = Math.min(60, Math.max(5, trackMeta.clipDuration));
    let count     = Math.ceil(total / dur);
    if (trackMeta.maxShorts != null) count = Math.min(count, trackMeta.maxShorts);
    const segs: Segment[] = [];
    for (let i = 0; i < count; i++) {
      const st  = i * dur;
      const sd  = Math.min(dur, total - st);
      if (sd < 5 && i > 0) break;
      segs.push({ index: i + 1, start: st, duration: parseFloat(sd.toFixed(1)) });
    }
    return segs;
  }, [userSegments, audioDuration, trackMeta]); // audioDuration triggers recalc

  // ── file handlers ──
  const handleAudioChange = useCallback(async (file: File) => {
    stopPreviewInternal();
    setAudioFile({ name: file.name, meta: 'Decoding audio…' });

    const base = file.name.replace(/\.[^/.]+$/, '');
    if (base.includes(' - ')) {
      const parts = base.split(' - ');
      setTrackMeta((m) => ({ ...m, artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }));
    } else {
      setTrackMeta((m) => ({ ...m, title: base }));
    }

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      const buf = await audioCtxRef.current!.decodeAudioData(await file.arrayBuffer());
      audioBufferRef.current = buf;
      setAudioDuration(buf.duration);
      setUserSegments(null); // reset to auto on new audio
      decodedAudioFileRef.current = file;
      setAudioFile({ name: file.name, meta: `${buf.duration.toFixed(1)}s · ${buf.sampleRate} Hz` });
      log(`[✔] Audio decoded: ${buf.duration.toFixed(2)}s (${buf.numberOfChannels} ch)`);
      toast(`Audio loaded: ${file.name}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Decode error';
      setAudioFile({ name: file.name, meta: 'Failed to decode' });
      log(`[ERROR] ${msg}`);
      toast(`Audio error: ${msg}`, 'error');
    }
  }, [stopPreviewInternal, log, toast]);

  const handleImageChange = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        coverRef.current = img;
        if (blurredBgRef.current) updateBlurredBackground(blurredBgRef.current, img);
        setImageFile({ name: file.name, meta: `${img.width}×${img.height}px` });
        log(`[✔] Cover loaded: ${file.name} (${img.width}×${img.height})`);
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, [log]);

  const handleSrtChange = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const cues = parseSRT(ev.target!.result as string);
      srtCuesRef.current = cues;
      setSrtFile({ name: file.name, meta: `${cues.length} cue(s) loaded` });
      log(`[✔] SRT loaded: ${cues.length} cue(s) from "${file.name}"`);
    };
    reader.readAsText(file);
  }, [log]);

  // ── segment editing ──
  const handleSegmentChange = useCallback((idx: number, key: 'start' | 'duration', val: number) => {
    setUserSegments((prev) => {
      const base = prev ?? getSegments();
      const next = base.map((s) => ({ ...s }));
      next[idx][key] = val;
      return next;
    });
  }, [getSegments]);

  const handleAddSegment = useCallback(() => {
    setUserSegments((prev) => {
      const base = prev ?? getSegments();
      const last  = base[base.length - 1];
      const start = last ? parseFloat((last.start + last.duration).toFixed(1)) : 0;
      const dur   = Math.max(1, Math.min(
        trackMeta.clipDuration,
        audioBufferRef.current ? audioBufferRef.current.duration - start : trackMeta.clipDuration,
      ));
      if (dur < 1 && audioBufferRef.current) { log('[!] No remaining audio.'); return base; }
      const next = [...base, { index: base.length + 1, start, duration: parseFloat(dur.toFixed(1)) }];
      log(`[+] Added Part #${next.length}: ${start}s, ${dur.toFixed(1)}s`);
      return next;
    });
  }, [getSegments, trackMeta.clipDuration, log]);

  const handleDeleteSegment = useCallback((idx: number) => {
    setUserSegments((prev) => {
      const base = prev ?? getSegments();
      const next = base.filter((_, i) => i !== idx).map((s, i) => ({ ...s, index: i + 1 }));
      log(`[*] Removed segment. ${next.length} remaining.`);
      return next;
    });
  }, [getSegments, log]);

  const handleAutoGenerate = useCallback(() => {
    setUserSegments(null);
    log('[*] Segments reset to auto-generated.');
  }, [log]);

  // ── project save / load ──
  const handleSaveProject = useCallback(() => {
    const project = serializeProject(
      trackMeta,
      vizConfig,
      userSegments,
      srtCuesRef.current,
      audioFile.name !== 'Choose .WAV or Audio File' ? audioFile.name : undefined,
      imageFile.name !== 'Choose Album Cover' ? imageFile.name : undefined,
    );
    downloadProject(project);
    toast('Project saved!', 'success');
    log('[✔] Project saved to file.');
  }, [trackMeta, vizConfig, userSegments, audioFile.name, imageFile.name, toast, log]);

  const handleLoadProject = useCallback(() => {
    projectFileInputRef.current?.click();
  }, []);

  const handleProjectFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const project = await loadProjectFromFile(file);
      setTrackMeta(project.trackMeta);
      setVizConfig(project.vizConfig);
      setUserSegments(project.userSegments);
      srtCuesRef.current = project.srtCues;
      if (project.srtCues.length > 0) {
        setSrtFile({ name: 'project-captions', meta: `${project.srtCues.length} cue(s) loaded` });
      }
      toast(`Project loaded: ${project.name}`, 'success');
      log(`[✔] Project loaded: "${project.name}" (saved ${project.savedAt})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Load error';
      toast(msg, 'error');
      log(`[ERROR] Project load failed: ${msg}`);
    }
  }, [toast, log]);

  // ── Spotify select ──
  const handleSpotifySelect = useCallback((title: string, artist: string, artUrl: string | null) => {
    setTrackMeta(m => ({ ...m, title, artist }));
    if (artUrl) {
      fetch(artUrl)
        .then(r => r.blob())
        .then(blob => {
          const objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            coverRef.current = img;
            if (blurredBgRef.current) updateBlurredBackground(blurredBgRef.current, img);
            setImageFile({ name: 'spotify-art.jpg', meta: `${img.width}×${img.height}px` });
            log(`[✔] Spotify cover loaded`);
          };
          img.src = objectUrl;
        })
        .catch(() => log('[!] Failed to load Spotify artwork'));
    }
    toast('Filled from Spotify ✓', 'success');
  }, [toast, log]);

  // ── Whisper auto-caption ──
  const handleAutoCaption = useCallback(async () => {
    const file = decodedAudioFileRef.current;
    if (!audioBufferRef.current || !file) {
      toast('Load an audio file first', 'error'); return;
    }
    setIsCaptioning(true);
    const id = toast('Generating captions with Whisper…', 'loading', 0);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/whisper', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const cues = parseSRT(data.srt);
      srtCuesRef.current = cues;
      setSrtFile({ name: 'auto-generated', meta: `${cues.length} cues from Whisper` });
      updateToast(id, `✓ Generated ${cues.length} caption cues`, 'success');
      log(`[✔] Whisper: ${cues.length} cues generated`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Caption error';
      updateToast(
        id,
        msg.includes('not configured')
          ? 'Add OPENAI_API_KEY to Vercel env vars'
          : `Caption error: ${msg}`,
        'error',
      );
    } finally {
      setIsCaptioning(false);
    }
  }, [toast, updateToast, log]);

  // ── recording ──
  const recordSingleShort = useCallback(
    (segment: Segment, currentIdx: number, total: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const buf = audioBufferRef.current;
        if (!buf) { reject(new Error('No audio loaded')); return; }

        const ac = audioCtxRef.current!;
        if (ac.state === 'suspended') ac.resume();

        segOffsetRef.current = segment.start;
        isRenderingRef.current = true;

        const clean = (metaRef.current.title || 'Short').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
        const outFile = `${clean}_part${String(segment.index).padStart(2, '0')}_short.${detectedFormat.ext}`;

        log(`[+] Recording Part #${segment.index}: ${segment.start.toFixed(1)}s → ${(segment.start + segment.duration).toFixed(1)}s`);

        const destNode = ac.createMediaStreamDestination();
        const src      = ac.createBufferSource();
        src.buffer     = buf;
        const gain     = ac.createGain();
        const now      = ac.currentTime;
        const fade     = Math.min(0.8, segment.duration * 0.15);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(1.0, now + fade);
        gain.gain.setValueAtTime(1.0, now + Math.max(fade, segment.duration - fade));
        gain.gain.linearRampToValueAtTime(0.001, now + segment.duration);

        const analyser   = ac.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(gain); gain.connect(analyser);
        analyser.connect(destNode);
        analyser.connect(ac.destination);

        const videoTracks = canvasRef.current!.captureStream(30).getVideoTracks();
        const combined    = new MediaStream([...videoTracks, ...destNode.stream.getAudioTracks()]);

        const opts = detectedFormat.mime
          ? { mimeType: detectedFormat.mime, videoBitsPerSecond: vizRef.current.exportQuality }
          : { videoBitsPerSecond: vizRef.current.exportQuality };

        const recorder = new MediaRecorder(combined, opts);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev) => { if (ev.data?.size > 0) chunks.push(ev.data); };

        let raf = 0;
        const recordStart = ac.currentTime;

        const tick = () => {
          if (stopFlagRef.current) { try { recorder.stop(); } catch (_) {} try { src.stop(); } catch (_) {} return; }
          const elapsed = ac.currentTime - recordStart;
          const { spectrum, bass } = computeSpectrumFromAnalyser(analyser, smoothedSpecRef.current);
          const canvas = canvasRef.current!;
          const ctx    = canvas.getContext('2d')!;
          renderShortsFrame(ctx, elapsed, segment.duration, spectrum, bass, {
            blurredBgCanvas: blurredBgRef.current,
            coverImage:      coverRef.current,
            vizConfig:       vizRef.current,
            srtCues:         srtCuesRef.current,
            segmentOffset:   segment.start,
            titleText:       metaRef.current.title,
            artistText:      metaRef.current.artist,
          });
          const overall = Math.round(((currentIdx + Math.min(1, elapsed / segment.duration)) / total) * 100);
          setProgress({ pct: overall, status: `Recording Part #${segment.index} (${elapsed.toFixed(1)}s / ${segment.duration.toFixed(1)}s)…` });
          if (elapsed < segment.duration) raf = requestAnimationFrame(tick);
        };

        recorder.onstop = () => {
          cancelAnimationFrame(raf);
          src.disconnect(); gain.disconnect(); analyser.disconnect();
          if (stopFlagRef.current) { resolve(); return; }
          const blob = new Blob(chunks, { type: detectedFormat.mime || 'video/webm' });
          const url  = URL.createObjectURL(blob);
          setDownloads((prev) => [...prev, { filename: outFile, url, sizeBytes: blob.size }]);
          // Auto-trigger browser download
          const a = document.createElement('a');
          a.href = url; a.download = outFile;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          log(`[✔] Saved ${outFile} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        };

        recorder.start(250);
        src.start(0, segment.start, segment.duration);
        raf = requestAnimationFrame(tick);
        src.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
      });
    },
    [detectedFormat, log],
  );

  const renderBatch = useCallback(async (segs: Segment[]) => {
    if (isRenderingRef.current) return;
    const buf = audioBufferRef.current;
    if (!buf) { log('[!] Please load an audio file first.'); return; }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    }

    stopPreviewInternal();
    isRenderingRef.current = true;
    stopFlagRef.current    = false;
    setIsRendering(true);
    setProgress({ pct: 0, status: 'Starting render…' });

    log(`${'='.repeat(50)}`);
    log(` Starting Batch Render (${segs.length} Short[s])`);
    log(`${'='.repeat(50)}`);

    for (let i = 0; i < segs.length; i++) {
      if (stopFlagRef.current) { log('[!] Render cancelled.'); break; }
      await recordSingleShort(segs[i], i, segs.length);
    }

    isRenderingRef.current = false;
    setIsRendering(false);
    if (!stopFlagRef.current) {
      setProgress({ pct: 100, status: 'All Shorts finished!' });
      log('[✔] Batch complete! Files downloaded.');
      toast(`Export complete — ${segs.length} clip${segs.length !== 1 ? 's' : ''} saved!`, 'success');
    } else {
      setProgress((p) => ({ ...p, status: 'Render stopped' }));
    }
  }, [stopPreviewInternal, recordSingleShort, log, toast]);

  // ── segments (computed) ──
  const segments = getSegments();

  // ── StepFooter helper ──
  interface StepFooterProps {
    onBack?: () => void;
    onNext?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
  }
  function StepFooter({ onBack, onNext, nextLabel = 'Continue →', nextDisabled }: StepFooterProps) {
    return (
      <div className="flex justify-between gap-3 pt-2">
        {onBack ? (
          <button onClick={onBack} className="px-5 py-3 rounded-xl bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-2)] font-semibold text-sm border border-[var(--border)] transition cursor-pointer">
            ← Back
          </button>
        ) : <div />}
        {onNext && (
          <button onClick={onNext} disabled={nextDisabled} className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-40 shadow-lg shadow-indigo-600/20">
            {nextLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hidden project file input */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,.shortsproject.json"
        className="hidden"
        onChange={handleProjectFileSelected}
      />

      <Header
        showBrand={false}
        codecLabel={`Export: .${detectedFormat.ext.toUpperCase()}`}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-5 order-first lg:order-last flex flex-col items-center">
          <CanvasPreview
            canvasRef={canvasRef}
            previewTimeStr={previewTimeStr}
            isPreviewPlaying={isPreviewPlaying}
            isRendering={isRendering}
            canRecord={canRecord}
            onTogglePreview={togglePreview}
          />
        </div>

        <div className="lg:col-span-7 order-last lg:order-first space-y-4">
          <StepperNav
            currentStep={currentStep}
            completedSteps={completedSteps}
            onChange={setCurrentStep}
          />

          {currentStep === 1 && (
            <div key="step-1" className="step-enter space-y-6">
              <MediaUploader
                audio={audioFile}
                image={imageFile}
                srt={srtFile}
                onAudioChange={handleAudioChange}
                onImageChange={handleImageChange}
                onSrtChange={handleSrtChange}
              />
              <SpotifySearch onSelect={handleSpotifySelect} />
              <TrackSettings trackMeta={trackMeta} onChange={setTrackMeta} />
              {audioFile.name !== 'Choose .WAV or Audio File' && (
                <button
                  onClick={handleAutoCaption}
                  disabled={isCaptioning}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                             bg-violet-600/10 hover:bg-violet-600/20 text-violet-400
                             border border-violet-500/30 text-sm font-semibold transition cursor-pointer
                             disabled:opacity-40"
                >
                  {isCaptioning
                    ? <><span className="animate-spin">⟳</span> Generating captions…</>
                    : <><span>✨</span> Auto-generate captions with Whisper</>
                  }
                </button>
              )}
              <StepFooter onNext={() => completeStep(1)} nextLabel="Style →" />
            </div>
          )}

          {currentStep === 2 && (
            <div key="step-2" className="step-enter space-y-6">
              <VisualStylePanel vizConfig={vizConfig} onChange={setVizConfig} />
              <StepFooter onBack={() => setCurrentStep(1)} onNext={() => completeStep(2)} nextLabel="Edit Clips →" />
            </div>
          )}

          {currentStep === 3 && (
            <div key="step-3" className="step-enter space-y-6">
              <SegmentEditor
                segments={segments}
                isManual={userSegments !== null}
                hasAudio={!!audioBufferRef.current}
                isRendering={isRendering}
                isPreviewPlaying={isPreviewPlaying}
                progress={progress}
                downloads={downloads}
                onPreviewSegment={(seg) => startPreview(seg.start, seg.duration)}
                onRenderSegment={(seg) => renderBatch([seg])}
                onRenderAll={() => renderBatch(segments)}
                onStop={() => { stopFlagRef.current = true; }}
                onTogglePreview={togglePreview}
                onSegmentChange={handleSegmentChange}
                onAddSegment={handleAddSegment}
                onDeleteSegment={handleDeleteSegment}
                onAutoGenerate={handleAutoGenerate}
              />
              <StepFooter onBack={() => setCurrentStep(2)} onNext={() => completeStep(3)} nextLabel="Preview & Export →" />
            </div>
          )}

          {currentStep === 4 && (
            <div key="step-4" className="step-enter space-y-6">
              <ExportPanel
                segmentCount={segments.length}
                isRendering={isRendering}
                progress={progress}
                downloads={downloads}
                onRenderAll={() => renderBatch(segments)}
                onStop={() => { stopFlagRef.current = true; }}
              />
              <SocialShare downloads={downloads} />
              <ConsoleLog logs={logs} onClear={() => setLogs([])} />
              <StepFooter onBack={() => setCurrentStep(3)} />
            </div>
          )}
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
