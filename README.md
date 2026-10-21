# Shorts Studio

> **1080×1920 vertical video generator** — React/Next.js, live 60 fps canvas preview, editable segments, SRT captions, Whisper auto-captions, Spotify search, and one-click Vercel deploy.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/carl-stem/youtube-shorts-studio)

---

## Features

| Feature | Details |
|---------|---------|
| 🎵 **Audio engine** | Web Audio API — decodes WAV/MP3/OGG, fade-in/out, live FFT spectrum |
| 🎨 **Live canvas** | 1080×1920 @ 60 fps — see every change instantly |
| ✂️ **Editable segments** | Add, delete, and adjust start/duration per clip — not just auto-sliced |
| 🌈 **5 color themes** | Indigo→Pink, Fire, Ocean, Neon, Gold |
| 📊 **3 spectrum styles** | Bars, Mirror Bars, Wave Line |
| 🖼️ **3 backgrounds** | Blurred Art, Dark Gradient, Pure Dark |
| 💬 **SRT / CC** | Upload a subtitle file — captions render on-canvas in every clip |
| 📢 **CTA overlay** | Watermark / call-to-action text, top or above-spectrum position |
| 🎬 **Export quality** | 1.5 / 3 / 6 / 8 Mbps — MP4 (H.264) or WebM (VP9) depending on browser |
| 📤 **Publish** | YouTube (resumable upload, schedule, category, thumbnail) and TikTok inbox drafts from any finished export |
| 🚀 **Vercel-ready** | Standard Next.js server build with optional API routes — editing and export run in the browser |

---

## Getting Started

```bash
git clone https://github.com/carl-stem/youtube-shorts-studio.git
cd youtube-shorts-studio
npm install
npm run dev
# → http://localhost:3000
```

Copy `.env.example` to `.env.local` to enable the optional server features (see [SETUP.md](SETUP.md)).

## API Routes

The editor and export run entirely in the browser. Optional server routes under `app/api/` need environment variables and degrade to "not configured" without them:

- `api/spotify/search` — Spotify track search for title/artist/cover fill
- `api/whisper` — OpenAI Whisper auto-captions
- `api/auth/*` — Google (YouTube) and TikTok OAuth connect/status/disconnect (tokens stored in Vercel KV)
- `api/upload/youtube/{session,chunk,status,thumbnail}` — YouTube publishing: the server only creates the resumable upload session; the browser sends the video straight to Google in 8 MiB chunks (falling back to a session-scoped 4 MiB relay if the browser blocks it), with pause/resume, category, made-for-kids, scheduling and custom thumbnails
- `api/upload/tiktok/{init,chunk,status}` — TikTok inbox upload: the browser sends chunks straight to TikTok (videos over 4 MB need the direct path; see [SETUP.md](SETUP.md#publishing-how-uploads-travel))
- `api/analytics/youtube` — recent Shorts and totals, opened from the 📊 button in the header once YouTube is connected

Connect accounts with the **Accounts** button in the header; finished exports in both workflows get a **Publish** button.

## Deploy to Vercel

```bash
npx vercel --prod
```

Or click the **Deploy** button above to import directly into Vercel.

---

## Project Structure

```
├── app/                   # Next.js App Router
│   ├── api/               # Optional server routes (auth, upload, analytics, spotify, whisper)
│   ├── layout.tsx
│   ├── page.tsx           # Audio / Video workflow switch
│   ├── manifest.ts
│   └── globals.css
├── components/
│   ├── Studio.tsx         # Audio Short workflow — state & audio engine
│   ├── VideoStudio.tsx    # Video Short workflow — clips, trim, export
│   ├── SegmentEditor.tsx  # Editable clip segments
│   ├── VisualStylePanel.tsx
│   ├── MediaUploader.tsx  # Audio + Image + SRT dropzones
│   ├── TrackSettings.tsx
│   ├── CanvasPreview.tsx
│   ├── Header.tsx
│   └── ConsoleLog.tsx
├── lib/
│   ├── canvasRenderer.ts  # All pure canvas drawing functions
│   ├── srtParser.ts
│   └── mediaCodec.ts
├── docs/                  # Roadmap and specs (editor-plan.md)
├── public/sw.js           # Service worker (offline shell + static asset cache)
└── types/index.ts
```

## Tech Stack

- **Next.js 14** App Router · TypeScript · Tailwind CSS
- **Web Audio API** — AudioContext, AnalyserNode, MediaRecorder
- **HTML5 Canvas** — 1080×1920 @ 60 fps via `requestAnimationFrame`
- **MediaRecorder API** — real-time video capture from canvas stream

---

## How It Works

1. Load a WAV/audio file → auto-decoded with `AudioContext.decodeAudioData`
2. Segments are auto-sliced (or manually edited) in the **Segments panel**
3. Hit **Render & Download All** — each segment records canvas + audio simultaneously via `MediaRecorder`, producing an MP4 or WebM file per clip
4. Files auto-download and are listed for manual re-download

> **Note:** `MediaRecorder` records in real-time (1× speed). A 3-minute song split into 3 clips = ~3 minutes of render time. Plan accordingly for batch jobs.
