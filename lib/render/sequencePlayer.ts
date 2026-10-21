// Plays the storyline on a canvas. Two <video> "decks" alternate: while one
// plays a clip the other is already loaded and seeked to the next clip, so cuts
// switch without waiting. Export records this same playback (recorderExport.ts).

import type { Id, Project, Seconds, StoryClip } from '../editor/model';
import { clipStarts, duration, locate } from '../editor/timeline';
import { drawEditorFrame } from './drawFrame';

/** Switch a little before a clip's out point so the average overshoot is near zero. */
const END_EPSILON = 1 / 60;

interface Deck {
  video: HTMLVideoElement;
  clipId: Id | null;
  /** Bumped on every load so a stale load cannot finish into a newer one. */
  token: number;
  loading: Promise<void> | null;
  gain: GainNode | null;
}

type PlayerEvent = 'time' | 'playing' | 'ended' | 'stall' | 'error';
type Listener = (value: unknown) => void;

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  getProject: () => Project;
  mediaUrl: (mediaId: Id) => string | null;
}

function once(target: EventTarget, ok: string, fail = 'error') {
  return new Promise<void>((resolve, reject) => {
    const done = () => { target.removeEventListener(ok, done); target.removeEventListener(fail, failed); resolve(); };
    const failed = () => { target.removeEventListener(ok, done); target.removeEventListener(fail, failed); reject(new Error('This video could not be read by the browser.')); };
    target.addEventListener(ok, done);
    target.addEventListener(fail, failed);
  });
}

export class SequencePlayer {
  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly decks: [Deck, Deck];
  private active = 0;
  private index = 0;
  private time: Seconds = 0;
  private playing = false;
  private raf = 0;
  private audio: { context: AudioContext; destination: MediaStreamAudioDestinationNode } | null = null;
  private listeners = new Map<PlayerEvent, Set<Listener>>();

  constructor(private readonly options: PlayerOptions) {
    const ctx = options.canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the video preview.');
    this.ctx2d = ctx;
    const makeDeck = (): Deck => {
      const video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('error', () => this.emit('error', 'A video could not be played. Try an MP4 (H.264) file.'));
      return { video, clipId: null, token: 0, loading: null, gain: null };
    };
    this.decks = [makeDeck(), makeDeck()];
  }

  on(event: PlayerEvent, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => { set.delete(listener); };
  }

  get currentTime() { return this.time; }
  get isPlaying() { return this.playing; }

  /** Audio of the playing clip, for recording. Creates the audio graph on first use (call from a click). */
  audioStream(): MediaStream {
    return this.ensureAudio().destination.stream;
  }

  async seek(t: Seconds) {
    this.stopLoop();
    const project = this.options.getProject();
    this.time = Math.min(Math.max(0, t), duration(project));
    const hit = locate(project, this.time);
    if (!hit) { this.draw(null); this.emit('time', this.time); return; }
    this.index = hit.index;
    try {
      await this.load(this.decks[this.active], hit.clip, hit.sourceTime);
    } catch (error) {
      this.emit('error', (error as Error).message);
    }
    this.draw(hit.clip);
    this.emit('time', this.time);
  }

  /** Redraws after an edit while paused (framing, look, trims). */
  refresh() {
    if (!this.playing) void this.seek(this.time);
  }

  async play() {
    const project = this.options.getProject();
    const total = duration(project);
    if (this.playing || total <= 0) return;
    if (this.time >= total - END_EPSILON) this.time = 0;
    this.ensureAudio();
    await this.audio?.context.resume();
    const hit = locate(project, this.time);
    if (!hit) return;
    this.index = hit.index;
    const deck = this.decks[this.active];
    if (deck.clipId !== hit.clip.id || Math.abs(deck.video.currentTime - hit.sourceTime) > 0.05) {
      await this.load(deck, hit.clip, hit.sourceTime);
    }
    this.playing = true;
    await this.startDeck(deck, hit.clip);
    if (!this.playing) return;
    // Announced only once the video is really moving, so a recording starts on real frames.
    this.emit('playing', true);
    this.preloadNext(project);
    this.loop();
  }

  pause() {
    if (!this.playing) return;
    this.stopLoop();
    this.decks.forEach((deck) => deck.video.pause());
  }

  destroy() {
    this.pause();
    this.listeners.clear();
    for (const deck of this.decks) {
      deck.token += 1;
      deck.video.removeAttribute('src');
      deck.video.load();
    }
    void this.audio?.context.close();
    this.audio = null;
  }

  private emit(event: PlayerEvent, value: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
    if (this.playing) { this.playing = false; this.emit('playing', false); }
  }

  private ensureAudio() {
    if (this.audio) return this.audio;
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    for (const deck of this.decks) {
      const source = context.createMediaElementSource(deck.video);
      deck.gain = context.createGain();
      source.connect(deck.gain);
      deck.gain.connect(context.destination);
      deck.gain.connect(destination);
    }
    this.audio = { context, destination };
    return this.audio;
  }

  private async load(deck: Deck, clip: StoryClip, sourceTime: Seconds) {
    const url = this.options.mediaUrl(clip.mediaId);
    if (!url) throw new Error('A video in this project is missing. Add it again.');
    deck.token += 1;
    const token = deck.token;
    deck.clipId = clip.id;
    const { video } = deck;
    const task = (async () => {
      if (video.src !== url) {
        video.src = url;
        await once(video, 'loadeddata');
      } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await once(video, 'loadeddata');
      }
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

  private async startDeck(deck: Deck, clip: StoryClip) {
    if (deck.gain) deck.gain.gain.value = clip.muted ? 0 : 1;
    try {
      await deck.video.play();
    } catch {
      this.pause();
      this.emit('error', 'The browser blocked playback. Press play again.');
    }
  }

  private preloadNext(project: Project) {
    const next = project.story[this.index + 1];
    if (next) void this.load(this.decks[1 - this.active], next, next.in).catch(() => undefined);
  }

  private draw(clip: StoryClip | null) {
    const deck = this.decks[this.active];
    drawEditorFrame(this.ctx2d, clip && deck.clipId === clip.id ? { video: deck.video, framing: clip.framing, look: clip.look } : null);
  }

  private loop = () => {
    if (!this.playing) return;
    const project = this.options.getProject();
    const clip = project.story[this.index];
    const deck = this.decks[this.active];
    if (!clip || deck.clipId !== clip.id) { this.pause(); return; }
    this.time = clipStarts(project)[this.index] + Math.max(0, deck.video.currentTime - clip.in);
    this.draw(clip);
    this.emit('time', this.time);
    if (deck.video.currentTime >= clip.out - END_EPSILON || deck.video.ended) {
      void this.advance(project);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private async advance(project: Project) {
    const current = this.decks[this.active];
    const nextClip = project.story[this.index + 1];
    if (!nextClip) {
      current.video.pause();
      this.time = duration(project);
      this.stopLoop();
      this.emit('time', this.time);
      this.emit('ended', true);
      return;
    }
    const nextDeck = this.decks[1 - this.active];
    const ready = nextDeck.clipId === nextClip.id && !nextDeck.loading;
    if (!ready) {
      current.video.pause();
      this.emit('stall', true);
      try {
        if (nextDeck.clipId === nextClip.id && nextDeck.loading) await nextDeck.loading;
        else await this.load(nextDeck, nextClip, nextClip.in);
      } catch (error) {
        this.stopLoop();
        this.emit('error', (error as Error).message);
        return;
      }
      if (!this.playing) return;
    }
    // Pause first so the outgoing clip's sound never overlaps the next one. The
    // switch itself counts as a stall so a recording skips its few milliseconds.
    this.emit('stall', true);
    current.video.pause();
    this.active = 1 - this.active;
    this.index += 1;
    await this.startDeck(nextDeck, nextClip);
    this.draw(nextClip);
    if (this.playing) this.emit('stall', false);
    this.preloadNext(project);
    if (this.playing) this.raf = requestAnimationFrame(this.loop);
  }
}
