// Plays the storyline on a canvas. Two <video> "decks" alternate: while one
// plays a clip the other is already loaded at the next clip, so cuts switch
// without waiting and a dissolve can show both at once. compose.ts decides what
// is visible and audible; this file keeps the videos and music in step with it.
// Export records this same playback (recorderExport.ts).

import type { Id, Project, Seconds, StoryClip } from '../editor/model';
import { clipStarts, duration, locate, overlapBefore } from '../editor/timeline';
import { frameAt } from './compose';
import { musicGainAt, musicTimeAt } from './audioPlan';
import { drawComposed } from './drawFrame';
import { FORMATS } from './layout';
import { loadDeck, once, type Deck } from './deck';

/** Tolerance for "reached the out point"; the edge timer makes switches this precise. */
const END_EPSILON = 0.004;
/** Gain changes ease over ~30 ms so cuts and ducking never click. */
const GAIN_EASE = 0.03;

type PlayerEvent = 'time' | 'playing' | 'ended' | 'stall' | 'error';
type Listener = (value: unknown) => void;

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  getProject: () => Project;
  mediaUrl: (mediaId: Id) => string | null;
}

export class SequencePlayer {
  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly decks: [Deck, Deck];
  private readonly music: HTMLAudioElement;
  private musicGain: GainNode | null = null;
  private active = 0;
  private index = 0;
  private time: Seconds = 0;
  private playing = false;
  private raf = 0;
  /** Fires right at a clip's out point, so slow frame rates do not overshoot cuts. */
  private edgeTimer = 0;
  /** True while a transition is being handled, so the frame loop and the edge timer never overlap. */
  private busy = false;
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
    this.music = document.createElement('audio');
    this.music.preload = 'auto';
  }

  on(event: PlayerEvent, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => { set.delete(listener); };
  }

  get currentTime() { return this.time; }
  get isPlaying() { return this.playing; }

  /** Clip sound plus music, for recording. Creates the audio graph on first use (call from a click). */
  audioStream(): MediaStream {
    return this.ensureAudio().destination.stream;
  }

  async seek(t: Seconds) {
    this.stopLoop();
    this.music.pause();
    const project = this.options.getProject();
    this.time = Math.min(Math.max(0, t), duration(project));
    const hit = locate(project, this.time);
    if (!hit) { this.render(project); this.emit('time', this.time); return; }
    this.index = hit.index;
    try {
      // A dissolve shows two clips: the outgoing one goes on the other deck.
      const layers = frameAt(project, this.time).layers;
      await this.load(this.decks[this.active], hit.clip, hit.sourceTime);
      const under = layers.find((layer) => layer.clip.id !== hit.clip.id);
      if (under) await this.load(this.decks[1 - this.active], under.clip, under.sourceTime);
    } catch (error) {
      this.emit('error', (error as Error).message);
    }
    this.render(project);
    this.emit('time', this.time);
  }

  /** Redraws after an edit while paused. */
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
    if (deck.clipId !== hit.clip.id || Math.abs(deck.video.currentTime - hit.sourceTime) > 0.05) await this.load(deck, hit.clip, hit.sourceTime);
    this.playing = true;
    this.applyGains(project);
    await this.playVideo(deck.video);
    if (!this.playing) return;
    await this.syncMusic(project, true);
    // Announced only once the video is really moving, so a recording starts on real frames.
    this.emit('playing', true);
    this.preloadNext(project);
    this.loop();
  }

  pause() {
    if (!this.playing) return;
    this.stopLoop();
    this.decks.forEach((deck) => deck.video.pause());
    this.music.pause();
  }

  destroy() {
    this.pause();
    this.listeners.clear();
    for (const element of [...this.decks.map((deck) => deck.video), this.music]) {
      element.removeAttribute('src');
      element.load();
    }
    this.decks.forEach((deck) => { deck.token += 1; });
    void this.audio?.context.close();
    this.audio = null;
  }

  private emit(event: PlayerEvent, value: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.edgeTimer);
    if (this.playing) { this.playing = false; this.emit('playing', false); }
  }

  private ensureAudio() {
    if (this.audio) return this.audio;
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const route = (element: HTMLMediaElement) => {
      const gain = context.createGain();
      context.createMediaElementSource(element).connect(gain);
      gain.connect(context.destination);
      gain.connect(destination);
      return gain;
    };
    this.decks.forEach((deck) => { deck.gain = route(deck.video); });
    this.musicGain = route(this.music);
    this.audio = { context, destination };
    return this.audio;
  }

  private setGain(gain: GainNode | null, value: number) {
    if (!gain || !this.audio) return;
    gain.gain.setTargetAtTime(value, this.audio.context.currentTime, GAIN_EASE);
  }

  private applyGains(project: Project) {
    const layers = frameAt(project, this.time).layers;
    for (const deck of this.decks) this.setGain(deck.gain, layers.find((layer) => layer.clip.id === deck.clipId)?.volume ?? 0);
    this.setGain(this.musicGain, musicGainAt(project, this.time));
  }

  private async syncMusic(project: Project, force: boolean) {
    const at = musicTimeAt(project, this.time);
    const url = project.music ? this.options.mediaUrl(project.music.mediaId) : null;
    if (at === null || !url) { this.music.pause(); return; }
    if (this.music.src !== url) { this.music.src = url; await once(this.music, 'loadedmetadata').catch(() => undefined); }
    if (force || Math.abs(this.music.currentTime - at) > 0.25) this.music.currentTime = at;
    if (this.music.paused) await this.music.play().catch(() => undefined);
  }

  private async load(deck: Deck, clip: StoryClip, sourceTime: Seconds) {
    const url = this.options.mediaUrl(clip.mediaId);
    if (!url) throw new Error('A video in this project is missing. Add it again.');
    await loadDeck(deck, clip.id, url, sourceTime);
  }


  private async playVideo(video: HTMLVideoElement) {
    try {
      await video.play();
    } catch {
      this.pause();
      this.emit('error', 'The browser blocked playback. Press play again.');
    }
  }

  private preloadNext(project: Project) {
    const next = project.story[this.index + 1];
    if (next) void this.load(this.decks[1 - this.active], next, next.in).catch(() => undefined);
  }

  private render(project: Project) {
    const byClip = (clipId: Id) => this.decks.find((deck) => deck.clipId === clipId && !deck.loading)?.video ?? null;
    drawComposed(this.ctx2d, frameAt(project, this.time), byClip, FORMATS[project.format].safeArea);
  }

  /**
   * Waits for `deck` to hold `clip`, pausing everything (and any recording)
   * meanwhile. With resumeCurrent the current clip carries on afterwards;
   * otherwise the caller is switching clips and resumes playback itself.
   */
  private async stallUntilReady(project: Project, deck: Deck, clip: StoryClip, resumeCurrent: boolean) {
    if (deck.clipId === clip.id && !deck.loading) return true;
    this.decks.forEach((entry) => entry.video.pause());
    this.music.pause();
    this.emit('stall', true);
    try {
      if (deck.clipId === clip.id && deck.loading) await deck.loading;
      else await this.load(deck, clip, clip.in);
    } catch (error) {
      this.stopLoop();
      this.emit('error', (error as Error).message);
      return false;
    }
    if (!this.playing) return false;
    if (resumeCurrent) {
      await this.playVideo(this.decks[this.active].video);
      await this.syncMusic(project, true);
      this.emit('stall', false);
    }
    return true;
  }

  private loop = () => {
    if (!this.playing) return;
    void this.tick();
  };

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.step(); } finally { this.busy = false; }
  }

  private async step() {
    // One step at a time schedules the next one, so there is only ever one frame loop.
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.edgeTimer);
    const project = this.options.getProject();
    const clip = project.story[this.index];
    const deck = this.decks[this.active];
    if (!clip || deck.clipId !== clip.id) { this.pause(); return; }
    this.time = clipStarts(project)[this.index] + Math.max(0, deck.video.currentTime - clip.in);
    this.render(project);
    this.applyGains(project);
    void this.syncMusic(project, false);
    this.emit('time', this.time);

    const next = project.story[this.index + 1];
    const other = this.decks[1 - this.active];
    const overlap = next ? overlapBefore(project, this.index + 1) : 0;
    if (next && overlap > 0 && other.video.paused && deck.video.currentTime >= clip.out - overlap) {
      if (!(await this.stallUntilReady(project, other, next, true))) return;
      await this.playVideo(other.video);
    }
    const remaining = clip.out - deck.video.currentTime;
    if (remaining <= END_EPSILON || deck.video.ended) {
      await this.advance(project);
      return;
    }
    if (!this.playing) return;
    const toEdge = Math.min(remaining, next && overlap > 0 && other.video.paused ? remaining - overlap : remaining);
    if (toEdge < 0.15) this.edgeTimer = window.setTimeout(this.loop, Math.max(0, (toEdge - END_EPSILON) * 1000));
    this.raf = requestAnimationFrame(this.loop);
  }

  private async advance(project: Project) {
    const current = this.decks[this.active];
    const nextClip = project.story[this.index + 1];
    if (!nextClip) {
      current.video.pause();
      this.music.pause();
      this.time = duration(project);
      this.stopLoop();
      this.emit('time', this.time);
      this.emit('ended', true);
      return;
    }
    const nextDeck = this.decks[1 - this.active];
    const alreadyPlaying = nextDeck.clipId === nextClip.id && !nextDeck.video.paused;
    if (!alreadyPlaying && !(await this.stallUntilReady(project, nextDeck, nextClip, false))) return;
    if (alreadyPlaying) {
      // Dissolve: the incoming clip is already on screen; just hand over.
      current.video.pause();
      this.active = 1 - this.active;
      this.index += 1;
    } else {
      // Pause first so the outgoing clip's sound never overlaps the next one. The
      // switch itself counts as a stall so a recording skips its few milliseconds.
      this.emit('stall', true);
      current.video.pause();
      this.active = 1 - this.active;
      this.index += 1;
      await this.playVideo(nextDeck.video);
      this.render(project);
      if (this.music.paused) await this.syncMusic(project, true);
      if (this.playing) this.emit('stall', false);
    }
    this.preloadNext(project);
    if (this.playing) this.raf = requestAnimationFrame(this.loop);
  }
}
