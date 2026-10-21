# Shorts Studio — Improvement Roadmap & Simple Video Editor Plan

**Status:** Approved 2026-10-21. Supersedes the non-goals in `docs/manual-video-mvp-spec.md` §3 for transitions and scheduled publishing.

## Decisions (owner, 2026-10-21)

| Topic | Decision |
|---|---|
| New dependencies | `mediabunny` approved (replaces `mp4-muxer`). `eslint`/`eslint-config-next` NOT approved — CI runs typecheck + tests + build only. `@upstash/redis` NOT approved — keep `@vercel/kv`. |
| Browser target | Full editor on current desktop Chrome, Edge, Safari, Firefox. Phones: Shorts editing supported; long-form on phones best-effort with MediaRecorder fallback. |
| Storage | On-device only (IndexedDB + File System Access handles). No accounts, no cloud sync. |
| Hosting | Vercel Pro (maxDuration up to 300s). ~4.5 MB request body limit still applies → direct browser→YouTube uploads. |
| Audio mode | Kept as the "Music visualizer" choice on the start screen. |
| AI costs | Paid tier later. For now auto-captions run on the owner's OpenAI key with a free per-user daily cap (default 60 min/day). Usage metering designed so a paid tier can raise the cap. |
| Spec changes | Transitions (cut/fade/dissolve) and scheduled publishing (private + publishAt) are in scope. |
| TikTok | Inbox delivery only. Fix upload size handling. |

## Current state summary

- Next.js 14.2.5 App Router, React 18, Tailwind 3, TypeScript strict. All rendering client-side (Canvas 2D + Web Audio + MediaRecorder). Vercel KV for OAuth tokens/sessions only.
- Audio mode (`components/Studio.tsx`): music visualizer Shorts, auto-sliced ≤60s segments, Spotify search, Whisper captions, project JSON save/load.
- Video mode (`components/VideoStudio.tsx`, replaced by the editor in M3): 4-step single-range clip editor (Add video → Choose a moment → Make it yours → Review & export); fit/fill, pan/zoom, 5 filters, title, SRT/VTT captions; real-time MediaRecorder export, Chromium-only.
- Known issues:
  - Publish/connect/analytics UI not reachable (`PublishClip` imported in `ExportPanel` but `accounts` never passed from `Studio.tsx:798`; `ConnectAccounts`, `AnalyticsDashboard` never imported).
  - Upload routes proxy whole files through Vercel (4.5 MB body limit).
  - `publishAt` allowed with public privacy; madeForKids hardcoded false; categoryId hardcoded 10.
  - Hydration mismatch at `Studio.tsx:129-131`.
  - `SocialShare` rendered twice (`ExportPanel.tsx:74`, `Studio.tsx:806`).
  - Endless 60fps rAF loop with per-frame setState.
  - Service worker cache-first for `/` and `/api/*`.
  - Open Whisper/Spotify routes without rate limits.
  - Tokens unencrypted despite docs.
  - Raw upstream errors in redirects.
  - No test/typecheck scripts, ESLint not installed, no CI.
  - README stale; manifest PNG icons missing.
  - Duplicated caption parsers, frame renderers and exporters; `lib/webCodecsEncoder.ts` unused.
  - 9:16 and duration caps hardcoded.

## A. Improvements roadmap

Sizes: **S** < ½ day, **M** 1–3 days, **L** > 3 days.

### Phase 0 — Stabilize & safety net

| ID | Item | Files | Size |
|---|---|---|---|
| P0-1 | `typecheck` (`tsc --noEmit`) and `test` (`node --test`) scripts | package.json | S |
| P0-3 | GitHub Actions CI: npm ci, typecheck, test, build | .github/workflows/ci.yml | S |
| P0-4 | Fix hydration mismatch: codec detection after mount; regression test | components/Studio.tsx, lib/mediaCodec.ts | S |
| P0-5 | Service worker: never cache `/api/*` or non-GET; network-first navigations; cache-first only for `/_next/static/*` and `/icons/*`; bump cache name to v2 and delete old caches | public/sw.js | S |
| P0-6 | `.env.example`; correct README/SETUP backend & privacy claims | README.md, SETUP.md, .env.example | S |
| P0-7 | Render `SocialShare` once | components/Studio.tsx | S |
| P0-8 | Manifest icons: drop missing PNG entries (or commit generated PNGs); no `canvas` dependency | app/manifest.ts, public/icons | S |
| P0-9 | Audio-mode render loop only while playing; per-frame values via refs/canvas, not state | components/Studio.tsx | M |

(P0-2 ESLint deferred — not approved.)

### Phase 1 — Security hardening

| ID | Item | Files | Size |
|---|---|---|---|
| S-1 | KV-backed rate limiting + same-origin checks on `/api/whisper`, `/api/spotify/search`; per-user Whisper minutes metering (daily cap 60 min, configurable) | lib/rateLimit.ts, lib/kv.ts, routes | M |
| S-2 | AES-256-GCM token encryption at rest (`TOKEN_ENC_KEY`), versioned, lazy migration of plaintext | lib/tokenManager.ts, lib/crypto.ts | M |
| S-3 | Error codes instead of raw upstream text in redirects/responses | auth callbacks, upload/analytics routes, app/page.tsx | S |
| S-4 | Upload metadata validation: MIME allow-list, categoryId list, publishAt only with private, required madeForKids | app/api/upload/youtube/* | S |
| S-5 | Security headers (CSP incl. blob: media and googleapis upload, Referrer-Policy, nosniff, Permissions-Policy) | next.config.mjs | S |

### Phase 2 — Publishing (direct browser upload)

| ID | Item | Size |
|---|---|---|
| U-1 | Server creates YouTube resumable session only (metadata), stores upload URL in KV; client uploads file | M |
| U-1a | Spike: verify YouTube upload URL accepts browser-origin PUTs. If yes: 8 MiB chunked resumable upload from browser with resume. If no: session-scoped ≤4 MiB chunk relay route | S |
| U-2 | Mount `ConnectAccounts` in a single shared header; pass `accounts` into publish flow; publish step in all flows | M |
| U-3 | Wire `AnalyticsDashboard` via `Header.onOpenAnalytics`, lazily loaded | S |
| U-4 | Metadata: category picker (default 22; 10 from audio mode), Short vs long defaults, madeForKids question, schedule (private+publishAt), thumbnail upload (≤2 MB JPEG), chapters in description | M |
| U-5 | TikTok inbox: chunked FILE_UPLOAD / PULL_FROM_URL to avoid body limit | M |

### Phase 3 — Deduplication

- **D-1** Single caption parser `lib/media/captions.ts` (SRT+VTT, BOM, CRLF tests).
- **D-2** Single frame drawer `lib/render/drawFrame.ts` + `text.ts` with relative layout.
- **D-3** Single MediaRecorder exporter `lib/render/recorderExport.ts`.
- **D-4** `next/dynamic` for heavy screens.
- **D-5** Single versioned project envelope for audio and editor projects.

## B. Simple video editor (Shorts + long-form)

### B.1 Principles

1. **Same 4 steps:** Add your videos → Put it in order → Make it yours → Review & share. Step gating, one primary button per step, toasts, plain language ("Cut here", "Music gets quieter when you talk"), "Your files stay on this device".
2. **Progressive disclosure:** default storyboard (big draggable tiles) + preview. "More control" toggle reveals lane timeline (text, captions, music, voice), numeric times, per-cut transitions, zoom, shortcuts. Same project data.
3. **Presets over sliders** (caption styles, title styles, looks, reframe Center/Left/Right/Fit-with-blur, music level Quiet/Balanced/Loud).
4. **Everything undoable;** helpers suggest, user applies (one undo step).
5. **Explain limits upfront** (capability check, export time estimate).

### B.2 Format & layout

Start screen: **Short** (9:16, ≤3 min), **Video** (16:9, any length), **Square** (1:1), **Music visualizer** (audio mode). Format can change later via reframe pass.

```ts
export type AspectId = 'short' | 'landscape' | 'square';
export interface FormatPreset { id: AspectId; width: number; height: number; fps: 30 | 60;
  maxSeconds: number | null; safeArea: Insets /* fractions 0..1 */ }
export const FORMATS: Record<AspectId, FormatPreset> = {
  short:     { id: 'short', width: 1080, height: 1920, fps: 30, maxSeconds: 180,
               safeArea: { top: .10, bottom: .20, left: .06, right: .12 } },
  landscape: { id: 'landscape', width: 1920, height: 1080, fps: 30, maxSeconds: null,
               safeArea: { top: .05, bottom: .08, left: .05, right: .05 } },
  square:    { id: 'square', width: 1080, height: 1080, fps: 30, maxSeconds: null,
               safeArea: { top: .06, bottom: .10, left: .06, right: .06 } },
};
export interface RelBox { anchor: 'top'|'center'|'bottom'; x: number; y: number; widthPct: number }
export function toPixels(box: RelBox, f: FormatPreset): DOMRect { /* pure */ }
```

`CanvasPreview` gets a `format` prop; font sizes become fractions of min(w,h); manifest `orientation: 'any'`.

### B.3 Data model (`lib/editor/model.ts`)

Storyline is a gap-free ordered clip list; timeline positions are derived. Captions live in source time on the media (stay in sync through edits); titles/voiceover are pinned to a clip + offset; music is the only absolutely-timed item.

```ts
export const SCHEMA_VERSION = 1;
export type Id = string; export type Seconds = number;
export interface MediaRef { id: Id; kind: 'video'|'audio'|'image'; name: string; size: number; lastModified: number;
  duration: Seconds; width?: number; height?: number; hasAudio: boolean; transcript?: TranscriptWord[] }
export interface TranscriptWord { text: string; start: Seconds; end: Seconds; isFiller?: boolean }
export type Framing = { mode: 'fill'; zoom: number; panX: number; panY: number } | { mode: 'fit'; background: 'black'|'blur' };
export interface StoryClip { id: Id; mediaId: Id; in: Seconds; out: Seconds; framing: Framing; look: VideoFilter;
  volume: number; muted: boolean; transitionIn: Transition }
export type Transition = { kind: 'cut' } | { kind: 'fade'|'dissolve'; duration: 0.25|0.5|1 };
export interface TextItem { id: Id; clipId: Id; offset: Seconds; duration: Seconds; text: string; style: TextStyleId; box: RelBox }
export interface CaptionTrack { enabled: boolean; style: CaptionStyleId; box: RelBox; overrides: Record<string, string> }
export interface MusicBed { mediaId: Id; start: Seconds; trimIn: Seconds; volume: number; duckUnderSpeech: boolean;
  fadeIn: Seconds; fadeOut: Seconds; loop: boolean }
export interface VoiceOver { id: Id; mediaId: Id; clipId: Id; offset: Seconds; volume: number }
export interface Chapter { id: Id; clipId: Id; offset: Seconds; title: string }
export interface Project { _type: 'shorts-studio-editor'; schemaVersion: typeof SCHEMA_VERSION; id: Id; name: string;
  createdAt: string; updatedAt: string; format: AspectId; templateId?: string; media: Record<Id, MediaRef>;
  story: StoryClip[]; texts: TextItem[]; captions: CaptionTrack; music: MusicBed | null; voice: VoiceOver[];
  chapters: Chapter[]; publish: PublishDraft }
```

- **Pure derived functions** (`lib/editor/timeline.ts`): `clipStarts`, `duration` (dissolve overlap subtracted), `locate(project, t)`, `captionsAt(project, t)`, `chaptersToDescription` (first 0:00, ≥3 chapters, each ≥10s).
- **Ops** (`lib/editor/ops.ts`), pure: addMedia, appendClip, split, trim, move, remove, setFraming, addText, setMusic, applySuggestions, reframeAll, makeShortFrom.
- **History** (`lib/editor/history.ts`): past/present/future snapshots with structural sharing, begin/commit + coalesceKey for drags, cap 100, labelled undo toasts; `useEditor()` via useReducer + context.

### B.4 Beginner features

| Feature | Approach |
|---|---|
| Auto-captions | Client decodes 120s windows → 16 kHz mono WAV (~3.8 MB) → rate-limited `/api/whisper` with word timestamps; 2s overlap, dedupe, per-chunk retry; transcript cached on MediaRef; counts against daily cap |
| Silence removal | 20 ms RMS; < −40 dBFS for ≥0.7s → suggestion with 0.15s padding |
| Filler removal | Transcript-tagged um/uh/standalone "like" etc.; same review list |
| Make a Short from long video | Select range/chapter → new 9:16 project, fill framing with Center/Left/Right pan presets; captions/text carried over |
| Templates | JSON presets in `lib/editor/templates.ts`; one undo step |
| Auto chapters | One per clip or manual; optional AI suggestion route later (cost opt-in) |
| Thumbnail picker | "Use this frame" → 1280×720 JPEG ≤2 MB, optional big-text preset |
| Voiceover | getUserMedia + MediaRecorder, pinned to clip |
| Music ducking | ≈−12 dB under speech via precomputed gain envelope (preview + export) |

### B.5 Persistence (`lib/editor/persist.ts`, no new dependency)

IndexedDB database `shorts-studio` with stores:

- `projects`
- `media` — FileSystemFileHandle where available, else Blob up to a cap, else fingerprint + "Find your file" relink by name/size/duration
- `derived` — filmstrips, waveforms

Autosave 1s debounced; "Continue editing" list; `.shortsproject.json` export; versioned migrations with tests; `navigator.storage.persist()`.

### B.6 Rendering engine (`lib/render/*`)

- **Shared:** `compose.ts` `frameAt(project, t)` (pure), `drawFrame.ts` (Canvas2D and OffscreenCanvas), `audioPlan.ts` gain envelopes.
- **Preview:** A/B `<video>` elements with preload/seek of the next clip; requestVideoFrameCallback or rAF only while playing; Web Audio graph for music/voice/ducking.
- **Export (primary):** Worker pipeline using **mediabunny** (approved; replaces mp4-muxer) for chunked demux from Blob and streaming mux; VideoDecoder/AudioDecoder → OffscreenCanvas compose → VideoEncoder (H.264 avc1.640028, fallback VP9/AV1) with backpressure → AudioEncoder (AAC, Opus fallback) mixing 10s windows via OfflineAudioContext; output streamed to FileSystemWritableFileStream (Chromium) or OPFS (others); progress/ETA, cancel, wake lock, background-tab safe.
- **Fallback:** real-time MediaRecorder (`lib/render/recorderExport.ts`) using canvas stream + Web Audio mix (removes Chromium-only `video.captureStream` dependency); foreground-only; default 10-min cap with warning.
- **Capability detection** on start screen with one honest status line.

### B.7 Long-form

- Remove 150 MB cap for directly picked files (lazy Blobs, never `arrayBuffer()` whole files); keep ZIP limits.
- Proposed limits: 8 GB/file, 4 h/project, 50 media (validate with memory tests).
- Background filmstrip + waveform caches; proxies deferred.
- Timeline zoom (pinch, Ctrl/⌘-scroll, slider), virtualized clip list.
- Shortcuts in More control: Space, J/K/L, S cut, Delete, ⌘Z / ⇧⌘Z, arrows frame-step.

### B.8 YouTube publishing (both formats)

PublishDraft defaults per format (Short: optional #Shorts; Long: chapters in description, thumbnail suggested). Category picker, madeForKids, privacy, schedule (private + publishAt), thumbnail. Final review gate before publish (MV-12/13). Resumable upload survives refresh; status polling via existing route.

### B.9 Integration

New editor ships as beta alongside `VideoStudio`; at parity (M3) "Video" routes to the editor and `VideoStudio.tsx` is deleted. Audio mode stays as Music visualizer.

```
lib/editor/   model.ts ops.ts timeline.ts history.ts schema.ts persist.ts templates.ts suggestions.ts chapters.ts
lib/render/   layout.ts compose.ts drawFrame.ts text.ts audioPlan.ts capabilities.ts recorderExport.ts
lib/render/webcodecs/  worker.ts demux.ts decode.ts encode.ts sink.ts estimate.ts
lib/media/    probe.ts audioWindows.ts waveform.ts filmstrip.ts captions.ts transcribe.ts
lib/publish/  youtubeUpload.ts categories.ts
components/editor/  EditorShell StartScreen FormatPicker steps/{AddMedia,Arrange,MakeItYours,ReviewShare}
                    Storyboard Timeline/{Timeline,Lane,ClipBlock,Playhead,Zoom} PreviewPlayer
                    panels/{Text,Captions,Music,Voice,Look,Framing,Suggestions,Chapters,Thumbnail} ExportDialog EditorProvider
```

Pure modules (`lib/editor`, `compose`, `layout`, `audioPlan`) have no DOM and are tested in Node. Components dispatch ops only. Target ≤ ~300 lines per file.

### B.10 Milestones

| M | Scope | Acceptance |
|---|---|---|
| M0 | Phase 0 + S-1..S-3 | CI green; no hydration warnings; SW never caches `/api/*` |
| M1 | Editor core (Shorts): model/ops/timeline/history, layout/compose/drawFrame, start screen, storyboard (add/trim/split/reorder/delete), A/B preview, undo/redo, shared MediaRecorder export | Join 3 clips, cut, reorder, undo/redo, export 1080×1920 MP4 with duration = sum of trims ±1 frame |
| M2 | Make it yours: text, captions (D-1), looks, framing presets, music + ducking, cut/fade/dissolve | Captions stay synced through edits; dissolve math correct; ducking envelope correct |
| M3 | Save/load (IndexedDB + relink), autosave, project list, ZIP import; replace VideoStudio | MV-01..MV-10 pass; reload restores; relink works; novice test ≥4/5 |
| M4 | Fast export (mediabunny Worker pipeline), disk streaming, progress/ETA, cancel, capability fallback | 10-min 1080p faster than real time in Chrome; <1 GB memory on 30-min export; background tab OK; Safari/Firefox work or fall back clearly |
| M5 | Long-form: 16:9 + square, lane timeline + zoom, filmstrip/waveform caches, chapters, raised limits, shortcuts | 1-hour source imports without memory spike; 200-clip timeline smooth; chapter rules enforced |
| M6 | Helpers: chunked auto-captions with daily cap, silence/filler suggestions, voiceover, templates, thumbnail, Make-a-Short | No request > 4.5 MB for a 20-min talk; apply-all = one undo; Make-a-Short correct range/captions |
| M7 | Publishing (U-1..U-4) for both formats; TikTok inbox fix (U-5) | 500 MB upload with progress and resume; scheduled private upload sets publishAt; thumbnail and chapters land |
| M8 | Optional: proxies, AI chapters, best-moment suggestion, audio mode on lib/render, paid tier | — |

**M1 status (2026-10-21): done.** The editor ships as "Editor (beta)" next to Audio and Video. Verified in headless Chromium with three test clips (add, cut, reorder, undo/redo, trim, export): a 10.0 s story exported as a 1080×1920 file of 9.985 s, with clips in the edited order. Step 3 already offers framing presets (center/left/right, fit with blurred edges), looks and per-clip mute. Deferred: `compose.ts` (frame description) arrives with text and captions in M2; `VideoStudio` keeps its own drawing and exporter until it is deleted in M3; the audio track can end up to ~0.1 s shorter than the video because recording pauses at each cut.

**M2 status (2026-10-21): done.** Step 3 has four tabs: Picture & transition (framing, look, sound off, cut / fade through black / blend from the last clip), Text (per-clip text with three styles, top/middle/bottom, 2/3/5 s or whole clip), Captions (SRT/VTT per video file in that file's own time, editable, three styles, on/off) and Music (one song, Quiet/Balanced/Loud, quieter under clip sound, repeat, gentle fade in/out). `compose.ts` describes each frame and `audioPlan.ts` the music level; both are pure and tested. Audio mode now shares the SRT/VTT parser (`lib/media/captions.ts`), which fixes `.vtt` captions there. Verified in headless Chromium: a 3-clip story with a 1 s blend, a fade, text, captions and music exported at 11.00–11.02 s for an 11.0 s story, with the blend, fade, text and caption visible in the output. Ducking is "quieter under any unmuted clip" rather than speech detection; that refinement belongs with the silence analysis in M6.

**M3 status (2026-10-21): done.** "Video" now opens the editor and `VideoStudio.tsx` is deleted. Projects autosave to IndexedDB (1 s after an edit, on tab hide and on leaving), list under "Continue editing" on the start screen, and can be downloaded and reopened as `.shortsproject.json` (versioned; `lib/editor/schema.ts` validates every field and is tested against `scripts/fixtures/editor-project-v1.json`). Each imported file is copied into the browser up to 512 MB; larger files, or files missing in another browser, appear in a "Find file" list that only accepts a file of the same length (±0.5 s). ZIP import reuses the safe extractor and pairs caption files with videos by name. Parity with MV-01..MV-10 was closed with: zoom slider and drag-to-reposition on the preview, caption timing edits, a count of unreadable caption entries, file type per import, and the export format named before export. Verified in headless Chromium: save → reload → reopen; backup opened in a fresh browser → relink refuses a wrong-length file and accepts the right ones; ZIP with two videos, one SRT and a text file; drag then undo. File System Access handles (no copy for very large files) are deferred to M5. The novice usability test (≥4/5) still needs real people.
